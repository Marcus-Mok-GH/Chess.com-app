import { GameService } from './gameService.js';
import { setupGameHandlers } from './handlers/gameHandlers.js';

// Export singleton instance
let gameService = null;

export function getGameService(io) {
  if (!gameService) {
    gameService = new GameService(io);
  }
  return gameService;
}

// Re-export setupGameHandlers for convenience
export { setupGameHandlers };

// Export GameService class
export { GameService };
