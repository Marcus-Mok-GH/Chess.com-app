export function setupAuthHandlers(io, socket) {
  socket.on('join_auth_room', (requestId) => {
    if (!requestId) return;
    console.log(`[Socket] Client ${socket.id} joining auth room: ${requestId}`);
    socket.join(`auth_${requestId}`);
  });

  socket.on('complete_remote_login', ({ requestId, session, userData }) => {
    if (!requestId || !session) return;
    console.log(`[Socket] Completing remote login for room: ${requestId}`);

    // Broadcast the session and user data to everyone in the room except the sender
    socket.to(`auth_${requestId}`).emit('remote_login_success', {
      session,
      userData
    });
  });
}
