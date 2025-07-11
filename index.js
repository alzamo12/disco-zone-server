// Import core modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
dotenv.config();
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
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


        app.get('/posts', async (req, res) => {
            try {
                const { email, sort = 'new', page = 1, limit = 5 } = req.query;
                const skip = (Number(page) - 1) * Number(limit);

                const pipeline = [];

                // Optional email filter
                if (email) {
                    pipeline.push({ $match: { authorEmail: email } });
                }

                // Join comments to count
                pipeline.push({
                    $lookup: {
                        from: 'comments',
                        localField: 'title',          // assuming unique titles
                        foreignField: 'postTitle',
                        as: 'commentsArr'
                    }
                });

                // Add commentCount and voteDifference
                pipeline.push({
                    $addFields: {
                        commentCount: { $size: '$commentsArr' },
                        voteDifference: { $subtract: ['$upVote', '$downVote'] }
                    }
                });

                // Sorting stage
                if (sort === 'popular') {
                    pipeline.push({ $sort: { voteDifference: -1 } });
                } else {
                    pipeline.push({ $sort: { createdAt: -1 } });
                }

                // Pagination stages
                pipeline.push({ $skip: skip });
                pipeline.push({ $limit: Number(limit) });

                // Final project (omit commentsArr)
                pipeline.push({
                    $project: { commentsArr: 0 }
                });

                const posts = await postsCollection.aggregate(pipeline).toArray();
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
                    const data = {
                        badge: existing?.badge,
                    }
                    return res.status(200).json({ message: 'User already exists', data: data });
                }

                // Create the user object
                const newUser = {
                    name,
                    email,
                    photoURL: photoURL || '',
                    badge: "bronze",
                    role: "user",             // 
                    createdAt: new Date(),        // registration time
                };

                const result = await usersCollection.insertOne(newUser);

                res.status(201).send(result);
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

        // user put api
        app.put('/user/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const updates = req.body;

                if (!updates || Object.keys(updates).length === 0) {
                    return res.status(400).json({ error: 'No fields provided for update' });
                }

                const result = await usersCollection.updateOne(
                    { email },
                    { $set: updates }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'User not found' });
                }

                res.json({
                    message: 'User updated',
                    modifiedCount: result.modifiedCount,
                    updatedFields: updates
                });
            } catch (err) {
                console.error('Error updating user:', err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });


        // role base api
        app.get('/user/role-badge/:email', async (req, res) => {
            try {
                const email = req.params.email;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ error: 'User not found' });

                const role = user.role || 'user'; // 'admin' or 'user'
                const badge = user.badge || 'bronze'; // 'bronze' or 'gold'

                res.json({ role, badge });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // payment api
        app.post('/create-payment-intent', async (req, res) => {
            const amount = 1000;
            try {
                const paymentIntent = await stripe.paymentIntents.create({
                    amount,
                    currency: "usd",
                    payment_method_types: ["card"]
                });
                res.json({ clientSecret: paymentIntent.client_secret })
            }
            catch (error) {
                res.status(500).json({ error: error.message });
            }
        })


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