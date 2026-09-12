export function setupAuthHandlers(io, socket) {
  socket.on('join_auth_room', () => {
    socket.emit('auth_error', { message: 'Auth room subscriptions are disabled.' });
  });

  // Never relay client-supplied sessions or user records over a socket.
  socket.on('complete_remote_login', () => {
    socket.emit('auth_error', { message: 'Remote login is disabled.' });
  });
}
