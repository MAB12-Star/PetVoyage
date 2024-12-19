const Airline = require('../models/airline');
const OpenAI = require("openai").default;

const openai = new OpenAI({
    apiKey: process.env.openaiKey,
});

async function generateAirlineNamesMap(airlineCodes) {
    let airlineNamesMap = {};

    try {
        // Generate the prompt dynamically
        const prompt = `Translate the following IATA airline codes to their respective airline names: ${airlineCodes.join(', ')}. Please provide each translation on a new line in the format "IATA Code: Airline Name".`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
        });

        const airlinesInfo = response.choices[0].message.content.trim().split('\n');
        airlinesInfo.forEach((line) => {
            const [iataCode, name] = line.split(':').map((item) => item.trim());
            if (iataCode && name) {
                airlineNamesMap[iataCode] = name;
            }
        });
    } catch (error) {
        console.error("Error fetching airline data from OpenAI:", error.message);
    }

    return airlineNamesMap;
}

module.exports = { generateAirlineNamesMap };
