require('dotenv').config();
const admin = require('firebase-admin');   
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
fastify.register(cors, { origin: '*' });

const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
};

// initializing Firebase Admin with service account credentialss
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

// initialize db
const db = admin.firestore();
  
fastify.decorate('authenticate', async (request, reply) => {
  try {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
          return reply.code(401).send({ error: 'No token provided' });
        }
        
        const token = authHeader.split(' ')[1];
        if (!token) {
            return reply.code(401).send({ error: 'Invalid token format' });
        }
        
        const decodedToken = await admin.auth().verifyIdToken(token);
        request.user = decodedToken;
    } catch (error) {
        return reply.code(401).send({ error: 'Unauthorized', details: error.message });
    }
});

// root endpoint 
fastify.get('/', async (request, reply) => {
    return { message: 'Hello from our backend!' };
});

fastify.get('/profiles', async (request, reply) => {
    try {
        const snapshot = await db.collection('users').get();
        let users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return { users };
    } catch (error) {
        reply.status(500).send({ error: 'Error fetching profiles for display' });
    }
});

// like endpoint
fastify.post('/api/like', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
        const { toUserId } = request.body;
        const fromUserId = request.user.uid;

        if (!toUserId) {
            return reply.status(400).send({ message: 'Invalid payload.' });
        }

        const userReference = db.collection('users').doc(fromUserId);
        const doc = await userReference.get();

        const toUserReference = db.collection('test-users').doc(toUserId); //currently from test-users
        const toDoc = await toUserReference.get();

        if (!doc.exists) {
            return reply.status(404).send({ message: 'User does not exist.' });
        }

        if (!toDoc.exists) {
            return reply.status(404).send({ message: 'Liked user does not exist.' });
        }

        const likes = doc.data().likes || [];
        if (likes.includes(toUserId)) {
            return reply.status(400).send({ message: 'A like for this user already exists.' });
        }

        await userReference.update({
            likes: admin.firestore.FieldValue.arrayUnion(toUserId),
        });

        const toLikes = toDoc.data().likes || [];
        if (toLikes.includes(fromUserId)) {
            const matchRef = db.collection('matches').doc();
            await matchRef.set({
                user1: fromUserId,
                user2: toUserId,
                timestamp: admin.firestore.FieldValue.serverTimestamp(), // Store timestamp from the server
            });
            return reply.status(200).send({ message: 'Match detected' });
        }

        return reply.status(200).send({ message: 'Like recorded' });

    } catch (err) {
        fastify.log.error(err);
        return reply.status(400).send({ message: err.message });
    }
});
    
const start = async () => {
    try {
        await fastify.listen({ port: 3000 });
        console.log('Server is running on http://localhost:3000');
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
    
    
