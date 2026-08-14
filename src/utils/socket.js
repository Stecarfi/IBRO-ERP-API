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
            origin: process.env.FRONTEND_URL || "https://ibrio-erp-app.vercel.app",
            credentials: true,
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[Socket.io] Client connected: ${socket.id}`);
        
        socket.emit('online_users', Array.from(new Set(onlineUsers.values())));

        socket.on('join_chat', async (data) => {
            if (data && data.user) {
                socket.join(data.user);
                onlineUsers.set(socket.id, data.user);
                broadcastOnlineUsers();
                console.log(`User ${data.user} joined personal room`);
                try {
                    await prisma.user.updateMany({
                        where: { user: data.user },
                        data: { isOnline: true }
                    });
                    broadcastUpdate('DB_UPDATE');
                } catch (err) {
                    console.error("Error setting isOnline true:", err);
                }
            }
        });

        socket.on('join_group', (groupId) => {
            socket.join(groupId);
            console.log(`Socket joined group ${groupId}`);
        });

        socket.on('send_message', (messageData) => {
            if (messageData.to === 'Todos') {
                socket.broadcast.emit('receive_message', messageData);
            } else if (messageData.to && messageData.to.startsWith('group_')) {
                socket.to(messageData.to).emit('receive_message', messageData);
            } else if (messageData.to) {
                socket.to(messageData.to).emit('receive_message', messageData);
            }
        });

        socket.on('send_nudge', (data) => {
            if (data.to) {
                if (data.to === 'Todos') socket.broadcast.emit('receive_nudge', data);
                else socket.to(data.to).emit('receive_nudge', data);
            }
        });

        socket.on('typing', (data) => {
            if (data.to) {
                socket.to(data.to).emit('typing', data);
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
