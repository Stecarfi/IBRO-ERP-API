const { Server } = require('socket.io');
const prisma = require('../prisma');

let io;
const onlineUsers = new Map(); // socket.id -> username

function broadcastOnlineUsers() {
    if (!io) return;
    const uniqueUsers = Array.from(new Set(onlineUsers.values()));
    io.emit('online_users', uniqueUsers);
}

function broadcastUpdate(type = 'DB_UPDATE') {
    if (!io) return;
    io.emit('db_update', { type, timestamp: Date.now() });
}

function initSocket(server) {
    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                callback(null, true);
            },
            credentials: true,
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket.io] Client connected: ${socket.id}`);
        
        socket.emit('online_users', Array.from(new Set(onlineUsers.values())));

        socket.on('join_chat', async (data) => {
            if (data && data.user) {
                const uStr = String(data.user).trim();
                socket.join(uStr);
                socket.join(uStr.toLowerCase());
                onlineUsers.set(socket.id, uStr);
                broadcastOnlineUsers();
                console.log(`User ${uStr} joined personal room`);
                try {
                    await prisma.user.updateMany({
                        where: { user: { equals: uStr, mode: 'insensitive' } },
                        data: { isOnline: true }
                    });
                    broadcastUpdate('DB_UPDATE');
                } catch (err) {
                    console.error("Error setting isOnline true:", err);
                }
            }
        });

        socket.on('join_group', (groupId) => {
            if (groupId) {
                const gStr = String(groupId).trim();
                socket.join(gStr);
                socket.join(gStr.toLowerCase());
                console.log(`Socket joined group ${gStr}`);
            }
        });

        socket.on('send_message', async (messageData) => {
            if (!messageData || !messageData.to) return;
            const toTarget = String(messageData.to).trim();
            if (toTarget.toLowerCase() === 'todos') {
                socket.broadcast.emit('receive_message', messageData);
                return;
            }

            const targetRooms = new Set();
            targetRooms.add(toTarget);
            targetRooms.add(toTarget.toLowerCase());

            try {
                const group = await prisma.chatGroup.findFirst({
                    where: { id: toTarget }
                });
                if (group && group.integrantes) {
                    const members = Array.isArray(group.integrantes) ? group.integrantes : [];
                    members.forEach(item => {
                        const uName = typeof item === 'string' ? item : (item.user || item.username || item.id);
                        if (uName && String(uName).toLowerCase() !== String(messageData.user || '').toLowerCase()) {
                            targetRooms.add(String(uName).trim());
                            targetRooms.add(String(uName).trim().toLowerCase());
                        }
                    });
                }
            } catch (e) {
                console.error('[send_message] Group routing error in socket.js:', e.message);
            }

            if (messageData.user) {
                targetRooms.delete(String(messageData.user).trim());
                targetRooms.delete(String(messageData.user).trim().toLowerCase());
            }

            const uniqueRooms = Array.from(targetRooms).filter(Boolean);
            if (uniqueRooms.length > 0) {
                socket.to(uniqueRooms).emit('receive_message', messageData);
            }
        });

        socket.on('send_nudge', async (data) => {
            if (!data || !data.to) return;
            const toTarget = String(data.to).trim();
            if (toTarget.toLowerCase() === 'todos') {
                socket.broadcast.emit('receive_nudge', data);
                return;
            }

            const targetRooms = new Set();
            targetRooms.add(toTarget);
            targetRooms.add(toTarget.toLowerCase());

            try {
                const group = await prisma.chatGroup.findFirst({
                    where: { id: toTarget }
                });
                if (group && group.integrantes) {
                    const members = Array.isArray(group.integrantes) ? group.integrantes : [];
                    members.forEach(item => {
                        const uName = typeof item === 'string' ? item : (item.user || item.username || item.id);
                        if (uName && String(uName).toLowerCase() !== String(data.user || '').toLowerCase()) {
                            targetRooms.add(String(uName).trim());
                            targetRooms.add(String(uName).trim().toLowerCase());
                        }
                    });
                }
            } catch (e) {
                console.error('[send_nudge] Group routing error in socket.js:', e.message);
            }

            if (data.user) {
                targetRooms.delete(String(data.user).trim());
                targetRooms.delete(String(data.user).trim().toLowerCase());
            }

            const uniqueRooms = Array.from(targetRooms).filter(Boolean);
            if (uniqueRooms.length > 0) {
                socket.to(uniqueRooms).emit('receive_nudge', data);
            }
        });

        socket.on('typing', (data) => {
            if (data.to) {
                socket.to(data.to).emit('typing', data);
            }
        });

        socket.on('message_reaction', (data) => {
            if (data.to === 'Todos') {
                socket.broadcast.emit('message_reaction', data);
            } else if (data.to) {
                socket.to(data.to).emit('message_reaction', data);
            }
        });

        socket.on('disconnect', async () => {
            console.log(`[Socket.io] Client disconnected: ${socket.id}`);
            if (onlineUsers.has(socket.id)) {
                const username = onlineUsers.get(socket.id);
                onlineUsers.delete(socket.id);
                broadcastOnlineUsers();
                
                try {
                    const stillOnline = Array.from(onlineUsers.values()).includes(username);
                    if (!stillOnline) {
                        await prisma.user.updateMany({
                            where: { user: username },
                            data: { isOnline: false }
                        });
                        broadcastUpdate('DB_UPDATE');
                    }
                } catch (err) {
                    console.error("Error setting isOnline false:", err);
                }
            }
        });
    });

    return io;
}

function getIO() {
    if (!io) throw new Error("Socket.io no ha sido inicializado");
    return io;
}

module.exports = {
    initSocket,
    getIO,
    broadcastUpdate,
    broadcastOnlineUsers
};
