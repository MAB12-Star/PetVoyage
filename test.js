if (airlineCodes.length > 0) {
    try {
        const prompt = `Translate the following IATA airline codes to their respective airline names and provide the link to their pet travel information page (if available): ${airlineCodes.join(', ')}. Please provide each result on a new line in the format "IATA Code: Airline Name - Pet Info URL: [URL]".`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{ role: "user", content: prompt }],
        });

        const airlinesInfo = response.choices[0].message.content.trim().split('\n');
        console.log('Airline Names and Pet Info URLs from OpenAI:\n', airlinesInfo);

        // Initialize airlineNamesMap and petInfoUrlsMap to avoid reference errors
        const airlineNamesMap = {};
        const petInfoUrlsMap = {};

        // Parse the airline names and pet info URLs into separate objects for easier lookup
        airlinesInfo.forEach(line => {
            const [iataCodePart, namePart] = line.split(' - ');
            if (iataCodePart && namePart) {
                const [iataCode, name] = iataCodePart.split(':').map(item => item.trim());
                const petInfoUrlMatch = namePart.match(/Pet Info URL: \[(.*)\]/);
                const petInfoUrl = petInfoUrlMatch ? petInfoUrlMatch[1].trim() : null;
                if (iataCode && name) {
                    airlineNamesMap[iataCode.toUpperCase()] = name;
                }
                if (iataCode && petInfoUrl) {
                    petInfoUrlsMap[iataCode.toUpperCase()] = petInfoUrl;
                }
            }
        });
    } catch (error) {
        console.error('Error fetching airline data from OpenAI:', error.message);
    }
}

res.render('regulations/showFlights', {
    flights: airlineCodes,
    airlineNamesMap, // Airline names mapped by IATA code
    petInfoUrlsMap, // Pet info URLs mapped by IATA code
    regulationMap: {} // Empty regulation map as we're not handling that here
});
} catch (error) {
console.error('Error fetching flight data from FlightLabs:', error.message);
if (!res.headersSent) {
    res.status(500).send('Error fetching flight data.');
}
}
});