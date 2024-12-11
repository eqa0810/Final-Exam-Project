const express = require('express');
const path = require('path');
require("dotenv").config({ path: path.resolve(__dirname, 'credentialsDontPost/.env') }); // Load .env file

// MongoDB Setup
const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = process.env.MONGO_CONNECTION_STRING;
const databaseAndCollection = { db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION };
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

const app = express();
const portNumber = process.env.PORT || 8080; 

// Set up EJS view engine
app.set("view engine", "ejs");
app.set("views", path.resolve(__dirname, "templates")); // Setting views directory to "templates"

// Middleware to parse URL-encoded data
app.use(express.urlencoded({ extended: false }));

// Route for the main page
app.get("/", async (req, res) => {
    let comments = [];
    try {
        await client.connect(); // Connect to MongoDB
        comments = await client
            .db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .find({})
            .toArray(); // Fetch all comments
    } catch (err) {
        console.error("Error fetching comments:", err);
    } finally {
        await client.close(); // Ensure the connection is closed
    }
    res.render("index", { comments }); // Render the homepage with comments
});

app.get("/holidays", async (req, res) => {
    const { year, stateCode } = req.query;
    const http = require("https");

    const options = {
        method: "GET",
        hostname: "public-holidays7.p.rapidapi.com",
        port: null,
        path: `/${year}/${stateCode}`,
        headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "public-holidays7.p.rapidapi.com"
        }
    };

    let holidays = [];
    let comments = [];

    // Fetch holidays
    const apiRes = await new Promise((resolve) => {
        const apiReq = http.request(options, resolve);
        apiReq.end();
    });

    const chunks = [];
    apiRes.on("data", (chunk) => chunks.push(chunk));
    apiRes.on("end", async () => {
        holidays = JSON.parse(Buffer.concat(chunks).toString());

        // If holidays is not an array or invalid input
        if (!Array.isArray(holidays) || holidays.length === 0) {
            return res.render("error", {
                message: "No holidays found! You might have entered an invalid year or state code.",
            });
        }

        // If valid holidays, continue fetching comments and rendering results
        await client.connect();
        comments = await client
            .db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .find({ year, stateCode })
            .toArray();
        await client.close();

        // Render results page
        res.render("results", {
            holidays,
            year,
            stateCode,
            comments,
            message: req.query.message // Pass success message if available
        });
    });
});



app.post("/addComment", async (req, res) => {
    const { username, comment, year, stateCode } = req.body;

    const http = require("https");

    const options = {
        method: "GET",
        hostname: "public-holidays7.p.rapidapi.com",
        port: null,
        path: `/${year}/${stateCode}`,
        headers: {
            "x-rapidapi-key": process.env.RAPIDAPI_KEY,
            "x-rapidapi-host": "public-holidays7.p.rapidapi.com"
        }
    };

    let holidays = [];

    // Fetch holidays from the API
    const apiRes = await new Promise((resolve) => {
        const apiReq = http.request(options, resolve);
        apiReq.end();
    });

    const chunks = [];
    apiRes.on("data", (chunk) => chunks.push(chunk));
    apiRes.on("end", async () => {
        holidays = JSON.parse(Buffer.concat(chunks).toString());

        // Insert the new comment into MongoDB
        await client.connect();
        await client
            .db(databaseAndCollection.db)
            .collection(databaseAndCollection.collection)
            .insertOne({ username, comment, year, stateCode });

        // Render results page with holidays and updated comments
        res.render("results", {
            holidays,
            year,
            stateCode,
            message: "Your comment has been added successfully!",
        });
    });
});


// Start the server
app.listen(portNumber, () => {
    console.log(`Web server started and running at http://localhost:${portNumber}`);
});

// Listen for user input to stop the server
process.stdin.setEncoding("utf8"); /* encoding */
const prompt = "Stop to shutdown the server: ";
process.stdout.write(prompt);

process.stdin.on('readable', function () {
    const dataInput = process.stdin.read();
    if (dataInput !== null) {
        const command = dataInput.trim();
        if (command.toLowerCase() === "stop") { // Shut down server when "stop" is entered
            process.exit(0);
        } else {
            console.log(`Invalid command: ${command}`);
        }
        process.stdout.write(prompt);
        process.stdin.resume();
    }
});
