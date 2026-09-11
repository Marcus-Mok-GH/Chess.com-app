export function setupAuthHandlers(io, socket) {
  socket.on('join_auth_room', (requestId) => {
    if (!requestId) return;
    console.log(`[Socket] Client ${socket.id} joining auth room: ${requestId}`);
    socket.join(`auth_${requestId}`);
  });

  // Never relay client-supplied sessions or user records over a socket.
  socket.on('complete_remote_login', () => {
    socket.emit('auth_error', { message: 'Remote login is disabled.' });
  });
}
