/**
 * Lessons Catalog (server mirror)
 *
 * Lean version of the client catalog used to seed the `lessons` table and to
 * validate lesson ids when recording progress. The client keeps the rich,
 * full-text version in `artifacts/chess/src/engine/lessons/lessonCatalog.js`;
 * this module intentionally holds only the fields the API needs.
 */

export const LESSON_CATALOG = [
  {
    id: 'opening-development',
    title: 'Piece Development & Opening Principles',
    topic: 'Opening',
    difficulty: 'beginner',
    order: 1,
    content:
      'The opening is where games are decided before the middle game begins. Your three main jobs in the first moves are to control the center, develop your minor pieces (knights and bishops), and castle your king to safety.\n\nDevelop each piece once, toward the center, and avoid moving the same piece twice. Do not rush your queen out early, and do not grab pawns at the edge of the board while your pieces are still asleep.\n\nA simple opening routine: 1. e4 e5 2. Nf3 Nc6 3. Bc4. Every move develops a piece and fights for the center. If you follow this pattern, you will reach the middle game with more active pieces than your opponent.',
    exampleFen: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
    exampleExplanation:
      'White has played 1.e4 e5 2.Nf3 Nc6 3.Bc4. Every move develops a piece toward the center. Black is fine to mirror with 3...Bc5 or 3...Nf6.',
    puzzleThemes: ['Back-rank Radar', 'Knight Ambush'],
  },
  {
    id: 'center-control',
    title: 'Center Control',
    topic: 'Strategy',
    difficulty: 'beginner',
    order: 2,
    content:
      'The four central squares — e4, e5, d4, d5 — are the most important squares on the board. A piece in the center attacks more squares and moves more freely than a piece stuck on the edge.\n\nFight for the center with your pawns and pieces. Pawn moves like e4 or d4 stake a claim, and knights that jump to c3, f3, c6 or f6 help hold those squares.\n\nIn the position below, White has just played Nc3, attacking Black\'s exposed queen while reinforcing the center. Black should retreat the queen to e6 or d8 and then challenge the center rather than wander.',
    exampleFen: 'rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 3',
    exampleExplanation:
      'After 1.e4 d5 2.exd5 Qxd5 3.Nc3, Black\'s queen has come out too early and is attacked. Black must spend a tempo retreating, which is exactly why beginners should develop pieces, not the queen.',
    puzzleThemes: ['Diagonal Strike', 'Rook and Bishop Net'],
  },
  {
    id: 'king-safety',
    title: 'King Safety & Castling',
    topic: 'King Safety',
    difficulty: 'beginner',
    order: 3,
    content:
      'A king in the center is a target. Castling moves your king to a corner behind a wall of pawns and connects your rooks — two benefits in one move.\n\nTry to castle within the first ten moves of the game. After castling, resist pushing the pawns in front of your king unless you have a concrete reason; every pawn move loosens your shelter.\n\nBefore you open the center or attack, count who is safer. A player whose king is still stuck in the middle often has to spend moves defending instead of building an attack.',
    exampleFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 4 4',
    exampleExplanation:
      'White has castled short: the king sits on g1 behind the f2, g2 and h2 pawns, and the rook on f1 is ready to fight for the center. Black\'s king still in the middle is the next job.',
    puzzleThemes: ['Back-rank Radar', 'Knight-Supported Queen'],
  },
  {
    id: 'pins',
    title: 'Pins',
    topic: 'Tactics',
    difficulty: 'intermediate',
    order: 4,
    content:
      'A pin is a line of attack where the target piece cannot move without exposing a more valuable piece behind it. An absolute pin ends at the king — the pinned piece simply cannot move.\n\nPins win material because the pinned defender is frozen. Attack the pinned piece with pawns and pieces to make its position unbearable.\n\nIn the example, Black\'s bishop on b4 pins the white knight on c3 to the king on e1. White would love to use the knight, but moving it would hang the king to the bishop\'s line.',
    exampleFen: 'rnbqk1nr/pppp1ppp/8/4p3/1b2P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
    exampleExplanation:
      'Black\'s bishop on b4 pins the white knight on c3 against the king on e1. The pinned knight is a liability — White should break the pin with a move like Bd2.',
    puzzleThemes: ['Diagonal Strike', 'Smothered Finish'],
  },
  {
    id: 'forks',
    title: 'Knight Forks',
    topic: 'Tactics',
    difficulty: 'intermediate',
    order: 5,
    content:
      'A fork is a single move that attacks two or more enemy pieces at once. The knight is the champion forker: it attacks in a different color pattern, so pieces that seem safe often are not.\n\nLook for forks that attack the king and a heavy piece together — the king must move, and the other victim falls next. A knight that lands on f7 or c7 near the enemy king is especially venomous.\n\nIn the example, the knight on f7 attacks the black king on h8 and the queen on d8 at the same time. The king is forced to move and the queen is lost.',
    exampleFen: '1r1q3k/5N2/8/8/8/8/8/7K w - - 0 1',
    exampleExplanation:
      'White to move: Nxh8 is a double attack, but even better is Ng5+ or capturing the queen first with Nxd8. The knight attacks both the king and the queen.',
    puzzleThemes: ['Smothered Finish', 'Knight Ambush', 'Knight-Supported Queen'],
  },
  {
    id: 'skewers',
    title: 'Skewers',
    topic: 'Tactics',
    difficulty: 'intermediate',
    order: 6,
    content:
      'A skewer is like a pin in reverse: the valuable piece is in front and the less valuable piece is behind it along the same line. When the front piece moves out of the way, the piece behind is captured.\n\nRooks, bishops and queens deliver skewers. The king and queen standing on the same file, rank or diagonal is a classic skewer target.\n\nIn the example, the rook on a1 skewers the black king on a5 against the queen on a8. The king must step off the a-file, and then the rook wins the queen.',
    exampleFen: 'q7/8/8/k7/8/8/8/R6K w - - 0 1',
    exampleExplanation:
      'The white rook on a1 attacks the king on a5 with the queen on a8 waiting behind it. Black is forced to move the king, losing the queen next move.',
    puzzleThemes: ['Back-rank Radar', 'Rook and Bishop Net'],
  },
  {
    id: 'back-rank-threats',
    title: 'Back-Rank Threats',
    topic: 'Tactics',
    difficulty: 'intermediate',
    order: 7,
    content:
      'When the enemy king is trapped behind its own pawns, it can often be mated on the first (or last) rank. A lone rook sweeping to the eighth rank can be a knockout blow.\n\nBefore you castle long or push the h-pawn, ask whether your own back rank is safe. Beginners are mated on the back rank more often than by any brilliant sacrifice.\n\nThe example is a finished back-rank mate: the black king on h8 is hemmed in by its own pawns, and the white rook on a8 controls the only escape square, g8.',
    exampleFen: 'R6k/5ppp/8/8/8/8/8/6K1 w - - 0 1',
    exampleExplanation:
      'White\'s rook on a8 gives check along the eighth rank. The king cannot step to g8, because the rook controls that square, and it cannot capture or block. It is checkmate.',
    puzzleThemes: ['Back-rank Radar', 'Diagonal Lock'],
  },
  {
    id: 'checkmate-patterns',
    title: 'Basic Checkmate Patterns',
    topic: 'Checkmate',
    difficulty: 'intermediate',
    order: 8,
    content:
      'Recognizing a few checkmate patterns turns winning positions into quick wins. Scholar\'s mate, the back-rank mate, the smothered mate and the ladder mate cover most beginners\' games.\n\nThe example below is Scholar\'s mate: the queen and bishop line up against the f7 square, which is defended only by the king, and a single queen move delivers mate in four moves.\n\nLearn the pattern so you can both play it and defend against it. When someone brings the queen out early, a move like Nf6 or g6 usually stops the mate and wins time.',
    exampleFen: 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4',
    examplePgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6?? 4. Qxf7#',
    exampleExplanation:
      'The white queen on f7 attacks the king directly; the queen is defended by the bishop on c4, so the king cannot capture it. Scholar\'s mate in four moves.',
    puzzleThemes: ['Smothered Finish', 'Knight-Supported Queen', 'Knight Ambush'],
  },
];

export function getLessonById(idOrSlug) {
  return LESSON_CATALOG.find((lesson) => lesson.id === idOrSlug) || null;
}

export function listLessons() {
  return LESSON_CATALOG.slice().sort((a, b) => a.order - b.order);
}
