// Import core modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
dotenv.config();
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-service-key.json");
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

// firebase admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const db = client.db("discoZone");
        const postsCollection = db.collection("posts");
        const usersCollection = db.collection("users");
        const commentsCollection = db.collection("comments");
        const announcementsCollection = db.collection("announcements");
        const tagsCollection = db.collection("tags");

        const verifyToken = async (req, res, next) => {
            const authHeader = req.headers?.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).send({ message: "unauthorized access" })
            }
            // console.log(authHeader)

            const token = authHeader.split(' ')[1];

            try {
                const decoded = await admin.auth().verifyIdToken(token);
                req.user = decoded
                // console.log('decode Token', decoded);
                next()
            }
            catch (error) {
                return res.status(401).send({ message: "unauthorized access" })
            }
        };

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
        app.post('/posts', verifyToken, async (req, res) => {
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
                const { email, sort = 'new', page = 1, limit } = req.query;

                const hasLimit = limit !== undefined;
                const parsedLimit = hasLimit ? Number(limit) : null;
                const parsedPage = Number(page);

                const skip = hasLimit ?
                    (parsedPage - 1) * parsedLimit
                    : null;

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


                if (hasLimit) {
                    pipeline.push({ $skip: skip });
                    pipeline.push({ $limit: parsedLimit })
                }

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


        app.get('/post/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const query = { _id: new ObjectId(id) }
                const post = await postsCollection.findOne(query);
                if (!post) return res.status(404).json({ error: 'Post not found' });
                res.json(post);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to fetch post' });
            }
        });

        // 2. Update votes (upvote/downvote) by ID
        app.put('/post/vote/:id', async (req, res) => {
            try {
                const id = req.params.id;
                const { type: voteType } = req.body; // voteType: 'up' or 'down'
                // console.log(voteType)
                const update =
                    voteType === 'up' ? { $inc: { upVote: 1 } } : { $inc: { downVote: 1 } };
                const query = { _id: new ObjectId(id) }

                const result = await postsCollection.updateOne(
                    query,
                    update
                );
                if (result.modifiedCount === 0)
                    return res.status(404).json({ error: 'Post not found or vote not applied' });
                res.json({ message: 'Vote updated' });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to update vote' });
            }
        });


        // user related API's

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
        app.get('/user/:email', verifyToken, async (req, res) => {
            try {
                const email = req.params.email;
                const user = await usersCollection.findOne({ email });
                if (!user) return res.status(404).json({ error: 'User not found' });

                res.send(user)
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

        // all user get api
        app.get("/users", async (req, res) => {
            const { search = '' } = req.query;
            const regex = new RegExp(search, 'i');
            const result = await usersCollection.find({ name: { $regex: regex } }).toArray();
            res.send(result)
        })

        // update user role patch api
        app.patch('/user/admin/:id', async (req, res) => {
            const { id } = req.params;
            const { role } = req.body;        // e.g. { role: "admin" }
            if (!['user', 'admin', 'moderator'].includes(role)) {
                return res.status(400).json({ error: 'Invalid role' });
            };

            const query = { _id: new ObjectId(id) };
            const updatedDoc = { $set: { role } };

            const result = await usersCollection.updateOne(
                query,
                updatedDoc
            );
            res.send(result)
        });

        // role base api
        app.get('/user/role-badge/:email', async (req, res) => {
            try {
                const email = req.params.email;
                console.log(email)
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




        // 3 --->> All comments related API

        //  Create comment for a post
        app.post('/comments', async (req, res) => {
            try {
                const comment = req.body; // should contain postId, postTitle, commenterEmail, content, createdAt
                const result = await commentsCollection.insertOne(comment);
                res.status(201).json({ message: 'Comment added', commentId: result.insertedId });
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to add comment' });
            }
        });

        //  Get comments by postId
        app.get('/comments/:postId', async (req, res) => {
            try {
                const postId = req.params.postId;
                const comments = await commentsCollection
                    .find({ postId })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.json(comments);
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to fetch comments' });
            }
        });

        // comment report put api
        app.put("/comment/report/:id", async (req, res) => {
            const { id } = req.params;
            const { feedback } = req.body;
            console.log(feedback)
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    reported: true,
                    feedback,
                    reportedAt: new Date()
                }
            };

            const result = await commentsCollection.updateOne(query, updatedDoc);
            res.send(result)
        });

        // Clear the `reported` flag (admin only)
        app.put("/comment/dismiss-report/:id", async (req, res) => {
            const { id } = req.params;

            const query = { _id: new ObjectId(id) };
            const update = {
                $set: {
                    reported: false,
                },
                $unset: {
                    feedback: "",
                    reportedAt: ""
                }
            };

            try {
                const result = await commentsCollection.updateOne(query, update);
                res.send(result)
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: "Failed to dismiss report" });
            }
        });

        // Get all reported comments
        app.get('/reported-comments', async (req, res) => {
            try {
                const query = { reported: true };
                const sort = { reportedAt: -1 }
                const reported = await commentsCollection
                    .find(query)
                    .sort(sort)
                    .toArray();
                res.send(reported);
            } catch (err) {
                console.error('Error fetching reported comments:', err);
                res.status(500).json({ error: 'Failed to load reported comments' });
            }
        });

        // delete a single comment
        app.delete("/comment/:id", async (req, res) => {
            const { id } = req.params;
            const query = { _id: new ObjectId(id) };
            const result = await commentsCollection.deleteOne(query);
            res.send(result);
        })



        // admin announcement related api's
        app.post('/announcement', async (req, res, next) => {
            try {
                const data = req.body;

                const newAnnouncement = {
                    ...data,
                    createdAt: new Date(),
                };

                const result = await announcementsCollection.insertOne(newAnnouncement);
                res.send(result)
            } catch (err) {
                console.error(err);
                res.status(500).json({ error: 'Failed to create announcement' });
            }
        });

        app.get("/announcements", async(req, res) => {
            const result = await announcementsCollection.find().toArray();
            res.send(result);
        })

        app.get("/announcement-count", async(req, res) => {
            const result = await announcementsCollection.countDocuments();
            res.send(result)
        })


        // 4 ----> Admin related API'S  <-----

        // admin stats API
        app.get("/admin-stats", async (req, res) => {
            try {
                const postsCount = await postsCollection.countDocuments();
                const commentsCount = await commentsCollection.countDocuments();
                const usersCount = await usersCollection.countDocuments();

                const result = { postsCount, commentsCount, usersCount };
                res.send(result);
            }
            catch (err) {
                res.send("An error occurred")
            }
        });

        // 5 -----> tags related API'S <-------

        app.post("/tag", async (req, res, next) => {
            try {
                const { tag } = req.body;
                const insertedDoc = {tag};
                const result = await tagsCollection.insertOne(insertedDoc);
                res.send(result)
            }
            catch (err) {
                next(err)
            }
        });

        // tags get api
        app.get("/tags", async(req, res) => {
            const result = await tagsCollection.find().toArray();
            res.send(result)
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