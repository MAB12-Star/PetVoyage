const express = require('express');
const router = express.Router();
const OpenAI = require('openai').default;
const Airport = require('../models/airlineRegulations');
const Flight = require('../models/flightSchema');
const Airline = require('../models/airline');

// Instantiate OpenAI with your API key
const openai = new OpenAI({
    apiKey: process.env.openaiKey,  // Ensure the OpenAI API key is set correctly in your .env
});

// Route to render the contact page initially
router.get('/', (req, res) => {
    console.log("GET / route accessed");
    res.render('index', { answer: null }); // Correct render path
});

// Route to handle the form submission and fetch answers
router.post('/ask-question', async (req, res) => {
   
    const { user_question } = req.body;  // Get the user question from the form submission
    console.log("Received question:", user_question);  // Log the question

    try {
        // First, try to search for relevant data in the database
        let answer = await searchDatabaseForAnswer(user_question);

        // If no relevant answer was found in the database, proceed with OpenAI
        if (!answer) {
            console.log("No answer found in database, querying OpenAI...");
            // Generate a prompt for OpenAI if no database answer
            const prompt = `Answer the following question about pet regulations:\n\n${user_question}\n`;
            console.log("Generated prompt:", prompt);

            // Request the answer from OpenAI
            const response = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: prompt }],
            });

            // Extract the answer from OpenAI's response
            answer = response.choices[0].message.content.trim();
            console.log("OpenAI response:", answer);
        }

        // Return the answer and question as JSON
        return res.status(200).json({ answer, question: user_question });
    } catch (error) {
        console.error("Error processing the question:", error.message);
        return res.status(500).json({
            error: 'An error occurred while processing your request.',
            details: error.message,
        });
    }
});

// Function to search the database for relevant information
async function searchDatabaseForAnswer(question) {
    // Log the received question
    console.log("Received question:", question);

    // Check if the question contains keywords related to pet regulations and airline
    if (question.toLowerCase().includes('pet') && question.toLowerCase().includes('airline')) {
        // Extract the airline name (this is just an example, customize based on your needs)
        const airlineName = extractAirlineFromQuestion(question);
        console.log("Extracted airline name:", airlineName);

        // Search for airline info in the database using the Airline model
        const airlineInfo = await Airline.findOne({ name: new RegExp(airlineName, 'i') });
        console.log("Airline found in database:", airlineInfo);

        if (airlineInfo) {
            // Look for relevant regulations in the Airport model or related fields
            const airportInfo = await Airport.findOne({ airline: airlineInfo._id });  // If Airport model stores related info
            console.log("Pet regulations found in the database:", airportInfo);

            if (airportInfo) {
                // If relevant pet regulation information is found
                return `Here are the pet regulations for ${airlineInfo.name}: ${airportInfo.regulations || 'No specific regulations found.'}`;
            } else {
                console.log("No pet regulations found for the airline in the database.");
            }
        } else {
            console.log("No airline found in the database with that name.");
        }
    }
    
    // If no relevant information is found, return null
    return null;
}

// Function to extract the airline name from the question (customize this based on your needs)
function extractAirlineFromQuestion(question) {
    // Example: This will simply extract the first word, assuming it's the airline name (you can improve this regex)
    const match = question.match(/\b[A-Za-z]+\b/);
    return match ? match[0] : '';  // Return first word if found
}


module.exports = router;
