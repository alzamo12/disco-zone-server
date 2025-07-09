// Import core modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
dotenv.config();
const PORT = process.env.PORT || 5000;
const app = express();

app.use(express.json());
app.use(cors(["https://disco-zone.web.app/", "http://localhost:5173/", "http://localhost:5174/"]));


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.g8eto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db("discoZone");
        const postsCollection = db.collection("posts");
        const usersCollection = db.collection("users");

        app.get('/posts/count/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const count = await postsCollection.countDocuments({ authorEmail: email });
                res.json({ count });
            } catch (err) {
                res.status(500).json({ error: 'Failed to fetch count' });
            }
        });

        // 2️⃣ Add a new post
        app.post('/posts', async (req, res) => {
            try {
                const post = req.body;
                post.upVote = post.upVote || 0;
                post.downVote = post.downVote || 0;
                post.createdAt = new Date();
                const result = await postsCollection.insertOne(post);
                res.json({ insertedId: result.insertedId });
            } catch (err) {
                res.status(500).json({ error: 'Failed to add post' });
            }
        });

        // get all posts or sorted posts via email or ass/dsc order
        app.get('/posts', async (req, res) => {
            try {
                const { email, limit, sort } = req.query;

                // Build filter object
                const filter = {};
                if (email) filter.authorEmail = email;

                // Build sort specifier
                let sortSpec = {};
                if (sort) {
                    const direction = sort.startsWith('-') ? -1 : 1;
                    const field = sort.replace(/^-/, '');
                    sortSpec[field] = direction;
                }

                // Start the cursor
                let cursor = postsCollection.find(filter);

                // Apply sorting if requested
                if (Object.keys(sortSpec).length) {
                    cursor = cursor.sort(sortSpec);
                }

                // Apply limit if provided and > 0
                const n = parseInt(limit, 10);
                if (!isNaN(n) && n > 0) {
                    cursor = cursor.limit(n);
                }

                // Execute
                const posts = await cursor.toArray();
                res.json(posts);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to fetch posts' });
            }
        });

        // delete a post
        app.delete('/post/:id', async (req, res) => {
            try {
                const id = req.params.id;

                //  delete the document
                const query = { _id: new ObjectId(id) };
                const result = await postsCollection.deleteOne(query);
                if (result.deletedCount === 0) {
                    return res.status(404).json({ error: 'Post not found' });
                }
                res.json({ message: 'Post deleted' });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to delete post' });
            }
        });


        // user related api's

        app.post('/user', async (req, res) => {
            try {
                const user = req.body;

                // Ensure required fields
                const { name, email, photoURL } = user;
                if (!name || !email) {
                    return res.status(400).json({ error: 'Name and email are required' });
                }

                // Check if user already exists
                const existing = await usersCollection.findOne({ email });
                if (existing) {
                    return res.status(200).json({ message: 'User already exists' });
                }

                // Create the user object
                const newUser = {
                    name,
                    email,
                    photoURL: photoURL || '',
                    isMember: false,              // default: not a member
                    createdAt: new Date(),        // registration time
                };

                await usersCollection.insertOne(newUser);

                res.status(201).json({ message: 'User created', user: newUser });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to create user' });
            }
        });

        // user get api
        app.get('/user/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ error: 'User not found' });

                // Determine badge: gold if user.isMember=true, else bronze
                const badge = user.isMember ? 'gold' : 'bronze';

                res.json({
                    name: user.name,
                    email: user.email,
                    image: user.photoURL,
                    badge,
                    registeredAt: user.createdAt,
                });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to fetch profile' });
            }
        });


        // user post api
        // Add this to your Express backend





        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


// Basic route
app.get('/', (req, res) => {
    res.send('API is running...');
});


// Start the server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));