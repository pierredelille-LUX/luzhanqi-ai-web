(() => {
  "use strict";

  const ROWS = 12;
  const COLS = 5;
  const RED = "red";
  const BLUE = "blue";
  const COL_LABELS = ["一", "二", "三", "四", "五"];
  const GOOGLE_CLIENT_ID = String(window.LUZHANQI_GOOGLE_CLIENT_ID || "").trim();
  const PROFILE_STORAGE_KEY = "luzhanqi:google-profile:v1";
  const SAVE_PREFIX = "luzhanqi:saved-game:v2:";
  const DIRECTIONS = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const PIECES = {
    flag: { label: "军旗", short: "旗", rank: 0, value: 12000, immobile: true },
    mine: { label: "地雷", short: "雷", rank: 0, value: 130, immobile: true },
    bomb: { label: "炸弹", short: "炸", rank: 0, value: 420 },
    commander: { label: "司令", short: "司", rank: 9, value: 940 },
    army: { label: "军长", short: "军", rank: 8, value: 800 },
    division: { label: "师长", short: "师", rank: 7, value: 670 },
    brigade: { label: "旅长", short: "旅", rank: 6, value: 540 },
    regiment: { label: "团长", short: "团", rank: 5, value: 430 },
    battalion: { label: "营长", short: "营", rank: 4, value: 325 },
    company: { label: "连长", short: "连", rank: 3, value: 235 },
    platoon: { label: "排长", short: "排", rank: 2, value: 165 },
    engineer: { label: "工兵", short: "工", rank: 1, value: 135 },
  };

  const PIECE_COUNTS = {
    flag: 1,
    mine: 3,
    bomb: 2,
    commander: 1,
    army: 1,
    division: 2,
    brigade: 2,
    regiment: 2,
    battalion: 2,
    company: 3,
    platoon: 3,
    engineer: 3,
  };

  const FIXED_TOP_LAYOUT = [
    "mine",
    "flag",
    "mine",
    "mine",
    "commander",
    "army",
    "bomb",
    "division",
    "brigade",
    "engineer",
    "platoon",
    "battalion",
    "company",
    "engineer",
    "company",
    "brigade",
    "platoon",
    "regiment",
    "bomb",
    "battalion",
    "engineer",
    "company",
    "platoon",
    "division",
    "regiment",
  ];

  const campKeys = new Set(
    [
      [2, 1],
      [2, 3],
      [3, 2],
      [4, 1],
      [4, 3],
      [7, 1],
      [7, 3],
      [8, 2],
      [9, 1],
      [9, 3],
    ].map(([r, c]) => key(r, c)),
  );

  const hqKeys = new Set(
    [
      [0, 1],
      [0, 3],
      [11, 1],
      [11, 3],
    ].map(([r, c]) => key(r, c)),
  );

  const railKeys = buildRailKeys();

  const boardEl = document.querySelector("#board");
  const turnCardEl = document.querySelector("#turnCard");
  const scoreGridEl = document.querySelector("#scoreGrid");
  const moveLogEl = document.querySelector("#moveLog");
  const capturedPanelEl = document.querySelector("#capturedPanel");
  const modeButtons = [...document.querySelectorAll(".mode-btn")];
  const newGameBtn = document.querySelector("#newGameBtn");
  const randomGameBtn = document.querySelector("#randomGameBtn");
  const undoBtn = document.querySelector("#undoBtn");
  const flipBtn = document.querySelector("#flipBtn");
  const accountStatusEl = document.querySelector("#accountStatus");
  const googleButtonEl = document.querySelector("#googleButton");
  const signOutBtn = document.querySelector("#signOutBtn");
  const saveGameBtn = document.querySelector("#saveGameBtn");
  const loadGameBtn = document.querySelector("#loadGameBtn");
  const saveStatusEl = document.querySelector("#saveStatus");

  let serial = 0;
  let state = createGame({ mode: "ai", random: false });
  let history = [];
  let viewSide = RED;
  let aiTimer = null;
  let account = loadStoredAccount();
  let googleInitialized = false;

  boardEl.addEventListener("click", onBoardClick);
  newGameBtn.addEventListener("click", () => resetGame(false));
  randomGameBtn.addEventListener("click", () => resetGame(true));
  undoBtn.addEventListener("click", undoMove);
  flipBtn.addEventListener("click", () => {
    viewSide = viewSide === RED ? BLUE : RED;
    render();
  });
  saveGameBtn.addEventListener("click", saveCurrentGame);
  loadGameBtn.addEventListener("click", loadSavedGame);
  signOutBtn.addEventListener("click", signOutGoogle);
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.mode;
      if (state.mode === nextMode) return;
      state.mode = nextMode;
      modeButtons.forEach((item) => item.classList.toggle("active", item === button));
      resetGame(false, nextMode);
    });
  });
  window.addEventListener("load", initGoogleAuth);

  render();
  renderAccount();

  function createGame({ mode, random }) {
    serial = 0;
    const board = Array.from({ length: ROWS * COLS }, () => null);
    if (random) {
      deployRandom(board, BLUE);
      deployRandom(board, RED);
    } else {
      deployFixed(board, BLUE);
      deployFixed(board, RED);
    }
    return {
      board,
      mode,
      turn: RED,
      selected: null,
      legalMoves: [],
      gameOver: false,
      winner: null,
      endReason: "",
      captures: { [RED]: [], [BLUE]: [] },
      log: ["传统暗棋：红方先行"],
      lastMove: null,
      aiThinking: false,
      ply: 1,
    };
  }

  function resetGame(random, mode = state.mode) {
    clearTimeout(aiTimer);
    history = [];
    state = createGame({ mode, random });
    modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
    viewSide = RED;
    setSaveStatus("");
    render();
  }

  function deployFixed(board, side) {
    const topSlots = deploymentSlots(BLUE);
    const slots =
      side === BLUE
        ? topSlots
        : topSlots.map((slot) => {
            const { r, c } = rowCol(slot);
            return index(ROWS - 1 - r, c);
          });

    FIXED_TOP_LAYOUT.forEach((type, i) => {
      board[slots[i]] = makePiece(type, side);
    });
  }

  function deployRandom(board, side) {
    const slots = deploymentSlots(side);
    const hqs = slots.filter((slot) => isHQ(slot));
    const flagSlot = sample(hqs);
    board[flagSlot] = makePiece("flag", side);

    const nearBack = slots.filter((slot) => {
      const { r } = rowCol(slot);
      return side === BLUE ? r <= 1 : r >= 10;
    });
    const mineSlots = shuffle(nearBack.filter((slot) => slot !== flagSlot)).slice(0, PIECE_COUNTS.mine);
    mineSlots.forEach((slot) => {
      board[slot] = makePiece("mine", side);
    });

    const restTypes = [];
    Object.entries(PIECE_COUNTS).forEach(([type, count]) => {
      if (type === "flag" || type === "mine") return;
      for (let i = 0; i < count; i += 1) restTypes.push(type);
    });
    const restSlots = shuffle(slots.filter((slot) => !board[slot]));
    shuffle(restTypes).forEach((type, i) => {
      board[restSlots[i]] = makePiece(type, side);
    });
  }

  function deploymentSlots(side) {
    const rows = side === BLUE ? [0, 1, 2, 3, 4, 5] : [6, 7, 8, 9, 10, 11];
    const slots = [];
    rows.forEach((r) => {
      for (let c = 0; c < COLS; c += 1) {
        const slot = index(r, c);
        if (!isCamp(slot)) slots.push(slot);
      }
    });
    return side === BLUE ? slots : slots.reverse();
  }

  function makePiece(type, side) {
    const spec = PIECES[type];
    serial += 1;
    return {
      id: `${side}-${type}-${serial}`,
      side,
      type,
      rank: spec.rank,
      label: spec.label,
      short: spec.short,
      value: spec.value,
      immobile: Boolean(spec.immobile),
      moved: false,
    };
  }

  function onBoardClick(event) {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    const slot = Number(cell.dataset.slot);
    if (!Number.isInteger(slot)) return;
    handleCell(slot);
  }

  function handleCell(slot) {
    if (state.gameOver || state.aiThinking) return;
    if (state.mode === "ai" && state.turn === BLUE) return;

    const piece = state.board[slot];
    const selected = state.selected;

    if (selected !== null) {
      const move = state.legalMoves.find((item) => item.to === slot);
      if (move) {
        commitMove(move);
        return;
      }
    }

    if (piece && piece.side === state.turn) {
      selectPiece(slot);
      return;
    }

    clearSelection();
  }

  function selectPiece(slot) {
    const piece = state.board[slot];
    const moves = legalMovesForPiece(state, slot);
    state.selected = slot;
    state.legalMoves = moves;
    if (!moves.length && piece) {
      state.log.unshift(`${sideName(piece.side)}棋子暂无合法走法`);
    }
    render();
  }

  function clearSelection() {
    state.selected = null;
    state.legalMoves = [];
    render();
  }

  function commitMove(move) {
    pushHistory();
    applyMove(state, move, { silent: false });
    state.selected = null;
    state.legalMoves = [];
    syncViewAfterTurnChange();
    render();
    maybeRunAI();
  }

  function maybeRunAI() {
    if (state.mode !== "ai" || state.turn !== BLUE || state.gameOver) return;
    state.aiThinking = true;
    render();
    aiTimer = window.setTimeout(() => {
      const move = chooseAIMove(state);
      state.aiThinking = false;
      if (move && !state.gameOver) {
        pushHistory();
        applyMove(state, move, { silent: false, actor: "ai" });
        syncViewAfterTurnChange();
      }
      render();
    }, 360);
  }

  function undoMove() {
    if (!history.length || state.aiThinking) return;
    clearTimeout(aiTimer);
    if (state.mode === "ai") {
      do {
        state = popHistory();
      } while (history.length && state.turn !== RED);
    } else {
      state = popHistory();
    }
    syncViewAfterTurnChange();
    render();
  }

  function pushHistory() {
    history.push(snapshotState(state));
    if (history.length > 80) history.shift();
  }

  function popHistory() {
    const previous = history.pop();
    return previous || state;
  }

  function snapshotState(source) {
    return JSON.parse(
      JSON.stringify({
        ...source,
        selected: null,
        legalMoves: [],
        aiThinking: false,
      }),
    );
  }

  function applyMove(game, move, { silent = false, actor = "player" } = {}) {
    const board = game.board;
    const attacker = board[move.from];
    const defender = board[move.to];
    if (!attacker) return game;

    let resultText = "";
    let flagCaptured = false;
    board[move.from] = null;

    if (!defender) {
      attacker.moved = true;
      board[move.to] = attacker;
      resultText = `${sideName(attacker.side)}棋子 ${coord(move.from)}→${coord(move.to)}`;
    } else {
      const outcome = resolveBattle(attacker, defender);
      flagCaptured = outcome.flagCaptured;

      if (outcome.result === "attacker") {
        attacker.moved = true;
        board[move.to] = attacker;
        capturePiece(game, attacker.side, defender, silent);
        resultText = battleLogText(attacker, defender, outcome, move);
      } else if (outcome.result === "defender") {
        board[move.to] = defender;
        capturePiece(game, defender.side, attacker, silent);
        resultText = battleLogText(attacker, defender, outcome, move);
      } else {
        board[move.to] = null;
        capturePiece(game, attacker.side, defender, silent);
        capturePiece(game, defender.side, attacker, silent);
        resultText = battleLogText(attacker, defender, outcome, move);
      }
    }

    game.lastMove = { from: move.from, to: move.to };
    game.ply += 1;

    if (!silent) {
      const prefix = actor === "ai" ? "电脑" : "玩家";
      game.log.unshift(`${prefix}：${resultText}`);
      game.log = game.log.slice(0, 80);
    }

    if (flagCaptured || !hasFlag(game, otherSide(attacker.side))) {
      game.gameOver = true;
      game.winner = attacker.side;
      game.endReason = `${sideName(attacker.side)}夺取军旗`;
      return game;
    }

    game.turn = otherSide(game.turn);
    if (!silent) {
      const nextMoves = generateAllMoves(game, game.turn);
      if (!nextMoves.length) {
        game.gameOver = true;
        game.winner = otherSide(game.turn);
        game.endReason = `${sideName(game.turn)}无可行动棋子`;
      }
    }
    return game;
  }

  function capturePiece(game, side, piece, silent) {
    if (silent) return;
    game.captures[side].push({ type: piece.type, side: piece.side, label: piece.label, short: piece.short });
  }

  function battleLogText(attacker, defender, outcome, move) {
    const attackerText = `${sideName(attacker.side)}棋子`;
    const defenderText = `${sideName(defender.side)}暗子`;
    const route = `${coord(move.from)}×${coord(move.to)}`;
    if (outcome.flagCaptured) {
      return `${attackerText} ${route} 夺取军旗`;
    }
    if (outcome.result === "attacker") {
      return `${attackerText} ${route}，${sideName(attacker.side)}胜`;
    }
    if (outcome.result === "defender") {
      return `${attackerText} ${route}，${defenderText}守住`;
    }
    return `${attackerText} ${route}，双方同归`;
  }

  function resolveBattle(attacker, defender) {
    if (defender.type === "flag") {
      return { result: "attacker", flagCaptured: true };
    }
    if (attacker.type === "bomb" || defender.type === "bomb") {
      return { result: "both", flagCaptured: false };
    }
    if (defender.type === "mine") {
      if (attacker.type === "engineer") return { result: "attacker", flagCaptured: false };
      return { result: "defender", flagCaptured: false };
    }
    if (attacker.rank > defender.rank) return { result: "attacker", flagCaptured: false };
    if (attacker.rank < defender.rank) return { result: "defender", flagCaptured: false };
    return { result: "both", flagCaptured: false };
  }

  function legalMovesForPiece(game, from) {
    const piece = game.board[from];
    if (!piece || piece.immobile || piece.side !== game.turn) return [];
    return movesFrom(game, from, piece);
  }

  function movesFrom(game, from, piece) {
    const moves = [];
    const seen = new Set();

    const addMove = (to, rail = false) => {
      if (to === from || seen.has(to)) return false;
      const target = game.board[to];
      if (target?.side === piece.side) return false;
      if (target && isCamp(to)) return false;
      seen.add(to);
      moves.push({ from, to, rail, capture: Boolean(target) });
      return !target;
    };

    for (const [dr, dc] of DIRECTIONS) {
      const next = adjacent(from, dr, dc);
      if (next !== null) addMove(next, false);
    }

    if (!isRail(from)) return moves;

    if (piece.type === "engineer") {
      engineerRailMoves(game, from, piece).forEach((to) => addMove(to, true));
      return moves;
    }

    const { r, c } = rowCol(from);
    for (const [dr, dc] of DIRECTIONS) {
      let nr = r + dr;
      let nc = c + dc;
      while (inBounds(nr, nc) && isRail(index(nr, nc))) {
        const to = index(nr, nc);
        const canContinue = addMove(to, true);
        if (!canContinue) break;
        nr += dr;
        nc += dc;
      }
    }
    return moves;
  }

  function engineerRailMoves(game, from, piece) {
    const results = [];
    const visited = new Set([from]);
    const queue = [from];

    while (queue.length) {
      const current = queue.shift();
      const { r, c } = rowCol(current);
      for (const [dr, dc] of DIRECTIONS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const next = index(nr, nc);
        if (!isRail(next) || visited.has(next)) continue;
        visited.add(next);
        const target = game.board[next];
        if (target?.side === piece.side) continue;
        if (target) {
          if (!isCamp(next)) results.push(next);
          continue;
        }
        results.push(next);
        queue.push(next);
      }
    }

    return results;
  }

  function generateAllMoves(game, side) {
    const originalTurn = game.turn;
    game.turn = side;
    const moves = [];
    game.board.forEach((piece, from) => {
      if (piece?.side === side && !piece.immobile) {
        moves.push(...legalMovesForPiece(game, from));
      }
    });
    game.turn = originalTurn;
    return moves;
  }

  function chooseAIMove(game) {
    const moves = generateAllMoves(game, BLUE);
    if (!moves.length) return null;

    let bestScore = -Infinity;
    const candidates = [];

    for (const move of moves) {
      const score = hiddenMoveScore(move, game);
      if (score > bestScore + 0.001) {
        bestScore = score;
        candidates.length = 0;
        candidates.push(move);
      } else if (Math.abs(score - bestScore) < 55) {
        candidates.push(move);
      }
    }

    return candidates[Math.floor(Math.random() * candidates.length)] || moves[0];
  }

  function hiddenMoveScore(move, game) {
    const attacker = game.board[move.from];
    const target = game.board[move.to];
    if (!attacker) return -Infinity;

    const { r: fromR } = rowCol(move.from);
    const { r: toR, c: toC } = rowCol(move.to);
    const blueFlag = findPiece(game, BLUE, "flag");
    const redFlagGuess = nearestSlot(move.to, [index(11, 1), index(11, 3)]);
    const homeThreat = blueFlag === -1 ? 0 : Math.max(0, 8 - manhattan(move.to, blueFlag)) * 8;
    const enemyCamp = Math.max(0, 14 - manhattan(move.to, redFlagGuess)) * 6;

    let score = Math.random() * 2;
    score += move.rail ? (attacker.type === "engineer" ? 34 : 14) : 0;
    score += isCamp(move.to) ? 42 : 0;
    score += (toR - fromR) * 8;
    score -= Math.abs(toC - 2) * 2;
    score += enemyCamp;

    if (!target) {
      score += attacker.moved ? 10 : 0;
      score += attacker.type === "engineer" ? 18 : 0;
      return score;
    }

    const targetMoved = Boolean(target.moved);
    const targetNearHome = blueFlag === -1 ? 0 : Math.max(0, 5 - manhattan(move.to, blueFlag)) * 38;
    const uncertainRisk = targetMoved ? 42 : 92;
    score += 95 + targetNearHome + homeThreat;

    if (attacker.type === "bomb") score += 130;
    if (attacker.type === "engineer") score += targetMoved ? 30 : 86;
    if (attacker.rank >= 7 && !targetMoved) score -= uncertainRisk + attacker.value * 0.08;
    if (attacker.rank >= 7 && targetMoved) score -= 28;
    if (attacker.rank <= 3 && targetMoved) score += 32;
    if (attacker.type === "commander" && !targetMoved) score -= 120;
    return score;
  }

  function render() {
    renderBoard();
    renderStatus();
    renderPanels();
  }

  function renderBoard() {
    const displaySlots = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        displaySlots.push(index(r, c));
      }
    }
    if (viewSide === BLUE) displaySlots.reverse();

    const legalByTarget = new Map(state.legalMoves.map((move) => [move.to, move]));
    const last = state.lastMove;
    boardEl.innerHTML = displaySlots
      .map((slot) => {
        const piece = state.board[slot];
        const terrainClasses = terrainClass(slot);
        const legal = legalByTarget.get(slot);
        const selected = state.selected === slot ? " selected" : "";
        const legalClass = legal ? ` ${legal.capture ? "attack" : "legal"}` : "";
        const lastClass = last && (last.from === slot || last.to === slot) ? " last-move" : "";
        const terrainTag = isCamp(slot) ? "营" : isHQ(slot) ? "旗" : "";
        const visible = piece ? isPieceVisible(piece) : false;
        const label = piece
          ? visible
            ? `${sideName(piece.side)} ${piece.label}`
            : `${sideName(piece.side)}暗子`
          : terrainTag || coord(slot);
        return `
          <div class="cell ${terrainClasses}${selected}${legalClass}${lastClass}" data-slot="${slot}" role="gridcell" aria-label="${label}">
            ${terrainTag ? `<span class="terrain-tag">${terrainTag}</span>` : ""}
            ${piece ? pieceMarkup(piece, visible) : ""}
          </div>
        `;
      })
      .join("");
  }

  function pieceMarkup(piece, visible) {
    const hidden = visible ? "" : " hidden";
    const immobile = visible && piece.immobile ? " immobile" : "";
    const text = visible ? piece.label : "军棋";
    const detail = visible ? "" : "<small>暗</small>";
    return `
      <button class="piece ${piece.side}${hidden}${immobile}" type="button" aria-label="${sideName(piece.side)}${visible ? ` ${piece.label}` : " 暗子"}">
        <span>${text}</span>${detail}
      </button>
    `;
  }

  function renderStatus() {
    const current = state.aiThinking ? "电脑思考中" : `${sideName(state.turn)}行棋`;
    const text = state.gameOver ? `${sideName(state.winner)}胜：${state.endReason}` : current;
    turnCardEl.textContent = text;
    turnCardEl.className = `turn-card ${state.gameOver ? state.winner : state.turn}`;
    undoBtn.disabled = !history.length || state.aiThinking;
  }

  function renderPanels() {
    const redPieces = state.board.filter((piece) => piece?.side === RED);
    const bluePieces = state.board.filter((piece) => piece?.side === BLUE);
    const visible = visibleSide();
    scoreGridEl.innerHTML = `
      ${scoreCard(RED, redPieces, visible)}
      ${scoreCard(BLUE, bluePieces, visible)}
    `;

    capturedPanelEl.innerHTML = `
      ${captureLine("红方俘获", state.captures[RED], BLUE)}
      ${captureLine("蓝方俘获", state.captures[BLUE], RED)}
    `;

    moveLogEl.innerHTML = state.log
      .slice(0, 30)
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join("");
  }

  function captureLine(title, pieces, color) {
    const chips = pieces.length
      ? pieces.map((piece) => `<span class="chip ${color}" title="${piece.label}">${piece.short}</span>`).join("")
      : `<span class="muted">暂无</span>`;
    return `<div><strong>${title}</strong><div class="capture-line">${chips}</div></div>`;
  }

  function scoreCard(side, pieces, visible) {
    const canSee = state.gameOver || side === visible;
    return `
      <div class="score-card">
        <strong>${sideName(side)}</strong>
        <div class="big">${canSee ? material(pieces) : "暗"}</div>
        <span>${pieces.length} 子在盘</span>
      </div>
    `;
  }

  function material(pieces) {
    return pieces.reduce((sum, piece) => sum + Math.round(piece.value / 10), 0);
  }

  function visibleSide() {
    if (state.gameOver) return null;
    return state.mode === "local" ? state.turn : RED;
  }

  function isPieceVisible(piece) {
    const visible = visibleSide();
    return state.gameOver || piece.side === visible;
  }

  function syncViewAfterTurnChange() {
    if (state.mode === "local") {
      viewSide = state.turn;
    }
  }

  function terrainClass(slot) {
    const classes = [];
    if (isCamp(slot)) classes.push("camp");
    if (isHQ(slot)) classes.push("hq");
    if (isRail(slot)) {
      classes.push("rail");
      const { r, c } = rowCol(slot);
      const h = (inBounds(r, c - 1) && isRail(index(r, c - 1))) || (inBounds(r, c + 1) && isRail(index(r, c + 1)));
      const v = (inBounds(r - 1, c) && isRail(index(r - 1, c))) || (inBounds(r + 1, c) && isRail(index(r + 1, c)));
      if (h) classes.push("rail-h");
      if (v) classes.push("rail-v");
    }
    return classes.join(" ");
  }

  function buildRailKeys() {
    const rails = new Set();
    [1, 5, 6, 10].forEach((r) => {
      for (let c = 0; c < COLS; c += 1) rails.add(key(r, c));
    });
    [0, 2, 4].forEach((c) => {
      for (let r = 1; r <= 10; r += 1) rails.add(key(r, c));
    });
    campKeys.forEach((camp) => rails.delete(camp));
    return rails;
  }

  function findPiece(game, side, type) {
    return game.board.findIndex((piece) => piece?.side === side && piece.type === type);
  }

  function hasFlag(game, side) {
    return findPiece(game, side, "flag") !== -1;
  }

  function adjacent(slot, dr, dc) {
    const { r, c } = rowCol(slot);
    const nr = r + dr;
    const nc = c + dc;
    return inBounds(nr, nc) ? index(nr, nc) : null;
  }

  function manhattan(a, b) {
    const ar = rowCol(a);
    const br = rowCol(b);
    return Math.abs(ar.r - br.r) + Math.abs(ar.c - br.c);
  }

  function nearestSlot(from, slots) {
    return slots.reduce((best, slot) => (manhattan(from, slot) < manhattan(from, best) ? slot : best), slots[0]);
  }

  function isCamp(slot) {
    const { r, c } = rowCol(slot);
    return campKeys.has(key(r, c));
  }

  function isHQ(slot) {
    const { r, c } = rowCol(slot);
    return hqKeys.has(key(r, c));
  }

  function isRail(slot) {
    const { r, c } = rowCol(slot);
    return railKeys.has(key(r, c));
  }

  function index(r, c) {
    return r * COLS + c;
  }

  function rowCol(slot) {
    return { r: Math.floor(slot / COLS), c: slot % COLS };
  }

  function key(r, c) {
    return `${r},${c}`;
  }

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function coord(slot) {
    const { r, c } = rowCol(slot);
    return `${COL_LABELS[c]}${ROWS - r}`;
  }

  function sideName(side) {
    return side === RED ? "红方" : "蓝方";
  }

  function otherSide(side) {
    return side === RED ? BLUE : RED;
  }

  function shuffle(items) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function sample(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function initGoogleAuth() {
    if (googleInitialized) return;
    if (!GOOGLE_CLIENT_ID) {
      googleButtonEl.innerHTML = '<div class="google-disabled">配置 Google Client ID 后启用登录</div>';
      return;
    }
    if (!window.google?.accounts?.id) {
      window.setTimeout(initGoogleAuth, 350);
      return;
    }

    googleInitialized = true;
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      ux_mode: "popup",
    });
    window.google.accounts.id.renderButton(googleButtonEl, {
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      locale: "zh-CN",
    });
  }

  function handleCredentialResponse(response) {
    const payload = decodeJwt(response.credential);
    if (!payload?.sub) {
      setSaveStatus("Google 登录失败：没有收到有效用户 ID。");
      return;
    }
    account = {
      id: payload.sub,
      name: payload.name || payload.email || "Google 用户",
      email: payload.email || "",
      picture: payload.picture || "",
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(account));
    renderAccount();
    setSaveStatus("已登录 Google，可保存到该账号的本机棋局槽。");
  }

  function decodeJwt(token) {
    try {
      const payload = token.split(".")[1];
      const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
      const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return null;
    }
  }

  function loadStoredAccount() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY)) || null;
    } catch {
      return null;
    }
  }

  function renderAccount() {
    const label = account ? escapeHTML(account.name) : "本机访客";
    const detail = account?.email ? escapeHTML(account.email) : "棋局保存在当前浏览器";
    accountStatusEl.innerHTML = `<strong>${label}</strong><span class="muted">${detail}</span>`;
    signOutBtn.disabled = !account;
    loadGameBtn.disabled = !hasSavedGame();
  }

  function currentSaveKey() {
    return `${SAVE_PREFIX}${account ? `google:${account.id}` : "guest"}`;
  }

  function hasSavedGame() {
    try {
      return Boolean(localStorage.getItem(currentSaveKey()));
    } catch {
      return false;
    }
  }

  function saveCurrentGame() {
    try {
      const payload = {
        version: 2,
        savedAt: new Date().toISOString(),
        state: snapshotState(state),
        history: history.map(snapshotState),
        viewSide,
      };
      localStorage.setItem(currentSaveKey(), JSON.stringify(payload));
      renderAccount();
      setSaveStatus(`已保存：${formatDateTime(payload.savedAt)}`);
    } catch {
      setSaveStatus("保存失败：浏览器存储不可用或空间不足。");
    }
  }

  function loadSavedGame() {
    try {
      const raw = localStorage.getItem(currentSaveKey());
      if (!raw) {
        setSaveStatus("当前账号没有已保存棋局。");
        return;
      }
      const payload = JSON.parse(raw);
      if (payload.version !== 2 || !payload.state?.board) {
        setSaveStatus("存档版本不兼容，无法读取。");
        return;
      }

      clearTimeout(aiTimer);
      state = payload.state;
      state.selected = null;
      state.legalMoves = [];
      state.aiThinking = false;
      history = Array.isArray(payload.history) ? payload.history : [];
      viewSide = payload.viewSide || RED;
      modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === state.mode));
      syncViewAfterTurnChange();
      render();
      setSaveStatus(`已读取：${formatDateTime(payload.savedAt)}`);
      maybeRunAI();
    } catch {
      setSaveStatus("读取失败：存档数据损坏。");
    }
  }

  function signOutGoogle() {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    account = null;
    localStorage.removeItem(PROFILE_STORAGE_KEY);
    renderAccount();
    setSaveStatus("已退出 Google，当前使用本机访客存档。");
  }

  function setSaveStatus(message) {
    saveStatusEl.textContent = message;
  }

  function formatDateTime(value) {
    if (!value) return "未知时间";
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function escapeHTML(value) {
    return value.replace(/[&<>"']/g, (char) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return entities[char];
    });
  }
})();
