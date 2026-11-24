import { Chessboard } from 'react-chessboard';
import { memo, useMemo } from 'react';
import { PIECE_IMAGE_PATHS } from './pieceImages';

// Stable, module-level defaults. Inline `{}` / `[]` defaults allocate a new
// reference on every render, which defeats the memoised options below.
const EMPTY_SQUARE_STYLES = Object.freeze({});

// Define static custom piece components outside render so the board receives
// one stable `pieces` object and never rebuilds its 64 squares on a repaint.
const CUSTOM_PIECES = Object.fromEntries(
  Object.entries(PIECE_IMAGE_PATHS).map(([piece, src]) => [
    piece,
    ({ svgStyle }) => (
      <img
        src={src}
        alt={piece}
        style={{ ...svgStyle, display: 'block', pointerEvents: 'none' }}
        draggable={false}
      />
    ),
  ]),
);

const themeColors = {
  green: { light: '#ebecd0', dark: '#779556' },
  brown: { light: '#f0d9b5', dark: '#b58863' },
  blue: { light: '#dee3e6', dark: '#8ca2ad' },
  purple: { light: '#efdcf5', dark: '#8877b7' },
};

/**
 * Renders a themed chessboard with shared custom piece images and move callbacks.
 *
 * @param {Object} props - Board configuration and interaction handlers.
 * @param {string|Object} [props.position] - FEN string or object with a fen() method; defaults to the starting position.
 * @param {Function} [props.onSquareClick] - Receives the clicked square.
 * @param {Function} [props.onPieceDrop] - Receives source and target squares; must return a synchronous truthy value to accept a move.
 * @param {Function} [props.canDragPiece] - Receives piece type and square; defaults to allowing dragging when absent or returning null/undefined.
 * @param {'white'|'black'} [props.boardOrientation='white'] - Side displayed at the bottom.
 * @param {Object} [props.customSquareStyles={}] - Styles keyed by square name.
 * @param {boolean} [props.showCoordinates=true] - Whether to display board coordinates.
 * @param {'green'|'brown'|'blue'|'purple'} [props.boardTheme='green'] - Board palette; unknown values use green colors.
 * @returns {import('react').ReactElement} The board inside its styled wrapper.
 */
function ChessBoard({
  position,
  onSquareClick,
  onPieceDrop,
  canDragPiece,
  boardOrientation = 'white',
  customSquareStyles = EMPTY_SQUARE_STYLES,
  showCoordinates = true,
  boardTheme = 'green',
}) {
  const colors = themeColors[boardTheme] || themeColors.green;

  const currentFen = useMemo(() => {
    if (!position) return 'start';
    if (typeof position === 'string') return position;
    if (typeof position.fen === 'function') return position.fen();
    return 'start';
  }, [position]);

  const chessboardOptions = useMemo(() => ({
    position: currentFen,
    boardOrientation,
    showNotation: showCoordinates,
    animationDurationInMs: 300,
    pieces: CUSTOM_PIECES,
    squareStyles: customSquareStyles,
    darkSquareStyle: { backgroundColor: colors.dark },
    lightSquareStyle: { backgroundColor: colors.light },
    allowDragging: true,
    onSquareClick: (args = {}) => {
      // args: { square: string, piece: PieceDataType | null }
      if (args.square) onSquareClick?.(args.square);
    },
    onPieceDrop: (args = {}) => {
      // args: { sourceSquare: string, targetSquare: string | null, piece: DraggingPieceDataType }
      if (!args.sourceSquare || !args.targetSquare) return false;
      const dropResult = onPieceDrop?.(args.sourceSquare, args.targetSquare) ?? false;
      // react-chessboard expects a synchronous boolean. Async move handlers
      // must leave the controlled board unchanged until the server confirms.
      if (dropResult && typeof dropResult.then === 'function') return false;
      return Boolean(dropResult);
    },
    canDragPiece: (args = {}) => {
      // The library supplies `piece.pieceType`; normalize defensively so a
      // malformed callback can never disable all pieces on the board.
      const pieceType = args.piece?.pieceType || args.pieceType;
      return canDragPiece?.(pieceType, args.square) ?? true;
    }
  }), [
    currentFen,
    boardOrientation,
    showCoordinates,
    customSquareStyles,
    colors,
    onSquareClick,
    onPieceDrop,
    canDragPiece
  ]);

  return (
    <div 
      className={`chess-board-wrapper theme-${boardTheme}`}
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'absolute', 
        top: 0, 
        left: 0,
        boxShadow: '0 0 40px rgba(0,0,0,0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
        touchAction: 'none'
      }}
    >
      <Chessboard options={chessboardOptions} />
    </div>
  );
}

// The board is the most expensive subtree in a game screen: every parent
// repaint (a clock tick, a chat message, a reaction) would otherwise rebuild
// all 64 squares. Props come from stable callbacks and memoised styles, so a
// shallow compare is enough to skip those repaints.
export default memo(ChessBoard);
