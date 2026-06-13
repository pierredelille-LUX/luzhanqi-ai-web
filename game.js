(() => {
  "use strict";

  const ROWS = 12;
  const COLS = 5;
  const RED = "red";
  const BLUE = "blue";
  const SIDES = [RED, BLUE];
  const COL_LABELS = ["一", "二", "三", "四", "五"];
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

  let serial = 0;
  let state = createGame({ mode: "ai", random: false });
  let history = [];
  let viewSide = RED;
  let aiTimer = null;

  boardEl.addEventListener("click", onBoardClick);
  newGameBtn.addEventListener("click", () => resetGame(false));
  randomGameBtn.addEventListener("click", () => resetGame(true));
  undoBtn.addEventListener("click", undoMove);
  flipBtn.addEventListener("click", () => {
    viewSide = viewSide === RED ? BLUE : RED;
    render();
  });
  modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextMode = button.dataset.mode;
      if (state.mode === nextMode) return;
      state.mode = nextMode;
      modeButtons.forEach((item) => item.classList.toggle("active", item === button));
      resetGame(false, nextMode);
    });
  });

  render();

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
      log: ["红方先行"],
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
      state.log.unshift(`${sideName(piece.side)} ${piece.label} 暂无合法走法`);
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
      board[move.to] = attacker;
      resultText = `${sideName(attacker.side)} ${attacker.label} ${coord(move.from)}→${coord(move.to)}`;
    } else {
      const outcome = resolveBattle(attacker, defender);
      flagCaptured = outcome.flagCaptured;

      if (outcome.result === "attacker") {
        board[move.to] = attacker;
        capturePiece(game, attacker.side, defender, silent);
        resultText = `${sideName(attacker.side)} ${attacker.label} ${coord(move.from)}×${coord(move.to)} ${defender.label}`;
      } else if (outcome.result === "defender") {
        board[move.to] = defender;
        capturePiece(game, defender.side, attacker, silent);
        resultText = `${sideName(attacker.side)} ${attacker.label} 进攻 ${defender.label} 失败`;
      } else {
        board[move.to] = null;
        capturePiece(game, attacker.side, defender, silent);
        capturePiece(game, defender.side, attacker, silent);
        resultText = `${attacker.label} 与 ${defender.label} 同归`;
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
    const moves = orderMoves(generateAllMoves(game, BLUE), game).slice(0, 48);
    if (!moves.length) return null;

    const livingPieces = game.board.filter(Boolean).length;
    const depth = livingPieces > 36 ? 2 : 3;
    let alpha = -Infinity;
    let bestScore = -Infinity;
    const candidates = [];

    for (const move of moves) {
      const next = cloneForSearch(game);
      applyMove(next, move, { silent: true, actor: "ai" });
      const score = minimax(next, depth - 1, alpha, Infinity, false);
      if (score > bestScore + 0.001) {
        bestScore = score;
        candidates.length = 0;
        candidates.push(move);
      } else if (Math.abs(score - bestScore) < 90) {
        candidates.push(move);
      }
      alpha = Math.max(alpha, bestScore);
    }

    return candidates[Math.floor(Math.random() * candidates.length)] || moves[0];
  }

  function minimax(game, depth, alpha, beta, maximizing) {
    if (game.gameOver) {
      if (game.winner === BLUE) return 1000000 + depth * 1000;
      if (game.winner === RED) return -1000000 - depth * 1000;
      return 0;
    }
    if (depth === 0) return evaluate(game);

    const side = maximizing ? BLUE : RED;
    const moves = orderMoves(generateAllMoves(game, side), game).slice(0, depth >= 2 ? 34 : 54);
    if (!moves.length) return side === BLUE ? -900000 : 900000;

    if (maximizing) {
      let value = -Infinity;
      for (const move of moves) {
        const next = cloneForSearch(game);
        applyMove(next, move, { silent: true });
        value = Math.max(value, minimax(next, depth - 1, alpha, beta, false));
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }

    let value = Infinity;
    for (const move of moves) {
      const next = cloneForSearch(game);
      applyMove(next, move, { silent: true });
      value = Math.min(value, minimax(next, depth - 1, alpha, beta, true));
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  function evaluate(game) {
    const redFlag = findPiece(game, RED, "flag");
    const blueFlag = findPiece(game, BLUE, "flag");
    if (redFlag === null) return 1000000;
    if (blueFlag === null) return -1000000;

    let score = 0;
    for (let slot = 0; slot < game.board.length; slot += 1) {
      const piece = game.board[slot];
      if (!piece) continue;
      const sign = piece.side === BLUE ? 1 : -1;
      let value = piece.value;
      value += positionalValue(piece, slot, piece.side === BLUE ? redFlag : blueFlag);
      if (isCamp(slot)) value += 36;
      if (isRail(slot) && !piece.immobile) value += piece.type === "engineer" ? 32 : 14;
      score += sign * value;
    }

    const blueMobility = generateAllMoves(game, BLUE).length;
    const redMobility = generateAllMoves(game, RED).length;
    score += (blueMobility - redMobility) * 4;
    score += flagPressure(game, BLUE, redFlag) - flagPressure(game, RED, blueFlag);
    return score;
  }

  function positionalValue(piece, slot, enemyFlagSlot) {
    if (piece.immobile) return 0;
    const { r, c } = rowCol(slot);
    const flag = rowCol(enemyFlagSlot);
    const distance = Math.abs(r - flag.r) + Math.abs(c - flag.c);
    const forward = piece.side === BLUE ? r : ROWS - 1 - r;
    let value = Math.max(0, 12 - distance) * 7 + forward * 4;
    if (piece.type === "engineer") value += Math.max(0, 10 - distance) * 5;
    if (piece.type === "bomb") value += Math.max(0, 9 - distance) * 4;
    return value;
  }

  function flagPressure(game, side, enemyFlagSlot) {
    let pressure = 0;
    game.board.forEach((piece, slot) => {
      if (!piece || piece.side !== side || piece.immobile) return;
      const distance = manhattan(slot, enemyFlagSlot);
      if (distance <= 3) pressure += piece.type === "engineer" || piece.type === "bomb" ? 70 : 45;
      if (distance <= 1) pressure += 95;
    });
    return pressure;
  }

  function orderMoves(moves, game) {
    return [...moves].sort((a, b) => moveScore(b, game) - moveScore(a, game));
  }

  function moveScore(move, game) {
    const attacker = game.board[move.from];
    const defender = game.board[move.to];
    if (!attacker) return -Infinity;
    let score = 0;
    if (move.rail) score += attacker.type === "engineer" ? 18 : 9;
    if (isCamp(move.to)) score += 36;
    const { r: fromR } = rowCol(move.from);
    const { r: toR } = rowCol(move.to);
    score += attacker.side === BLUE ? (toR - fromR) * 7 : (fromR - toR) * 7;

    if (defender) {
      const outcome = resolveBattle(attacker, defender);
      if (outcome.flagCaptured) return 50000;
      if (outcome.result === "attacker") score += defender.value + 120;
      if (outcome.result === "both") score += defender.value - attacker.value * 0.62;
      if (outcome.result === "defender") score -= attacker.value + 80;
    }
    return score + Math.random() * 0.2;
  }

  function cloneForSearch(game) {
    return {
      board: game.board.map((piece) => (piece ? { ...piece } : null)),
      mode: game.mode,
      turn: game.turn,
      selected: null,
      legalMoves: [],
      gameOver: game.gameOver,
      winner: game.winner,
      endReason: game.endReason,
      captures: { [RED]: [], [BLUE]: [] },
      log: [],
      lastMove: game.lastMove ? { ...game.lastMove } : null,
      aiThinking: false,
      ply: game.ply,
    };
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
        const label = piece ? `${sideName(piece.side)} ${piece.label}` : terrainTag || coord(slot);
        return `
          <div class="cell ${terrainClasses}${selected}${legalClass}${lastClass}" data-slot="${slot}" role="gridcell" aria-label="${label}">
            ${terrainTag ? `<span class="terrain-tag">${terrainTag}</span>` : ""}
            ${piece ? pieceMarkup(piece) : ""}
          </div>
        `;
      })
      .join("");
  }

  function pieceMarkup(piece) {
    const immobile = piece.immobile ? " immobile" : "";
    return `
      <button class="piece ${piece.side}${immobile}" type="button" aria-label="${sideName(piece.side)} ${piece.label}">
        <span>${piece.label}</span>
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
    scoreGridEl.innerHTML = `
      <div class="score-card">
        <strong>红方</strong>
        <div class="big">${material(redPieces)}</div>
        <span>${redPieces.length} 子在盘</span>
      </div>
      <div class="score-card">
        <strong>蓝方</strong>
        <div class="big">${material(bluePieces)}</div>
        <span>${bluePieces.length} 子在盘</span>
      </div>
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

  function material(pieces) {
    return pieces.reduce((sum, piece) => sum + Math.round(piece.value / 10), 0);
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

  function escapeHTML(value) {
    return value.replace(/[&<>"']/g, (char) => {
      const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return entities[char];
    });
  }
})();
