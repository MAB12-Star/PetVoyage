const mongoose = require('mongoose');
const fs = require('fs');
const Airline = require('./models/airline'); // Adjust this to your correct model path

// MongoDB Atlas connection setup
const targetClient = mongoose.connect('mongodb+srv://michaelaronblue:SimoBb4OVT0soBRy@cluster0.d0mdx.mongodb.net/test', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch(err => console.log("MongoDB connection error:", err));

// Function to generate the sitemap
async function generateSitemap() {
    try {
        // Fetch all airline slugs from the database
        const airlines = await Airline.find({}, 'slug');  // Only get the slug field

        const baseUrl = 'https://www.petvoyage.ai/airlines/';  // Your base URL for airlines

        // Start the XML structure
        let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
        sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // Loop through each airline to add its page to the sitemap
        airlines.forEach(airline => {
            sitemap += `  <url>\n`;
            sitemap += `    <loc>${baseUrl}${airline.slug}</loc>\n`;  // Use the airline slug for the URL
            sitemap += `    <lastmod>${new Date().toISOString()}</lastmod>\n`;  // Current date as last modified
            sitemap += `    <priority>0.8</priority>\n`;  // Priority can be adjusted
            sitemap += `  </url>\n`;
        });

        // Close the XML structure
        sitemap += '</urlset>';

        // Save the sitemap to a file in the root directory
        fs.writeFileSync('sitemap.xml', sitemap);
        console.log('Sitemap has been generated successfully.');

    } catch (error) {
        console.error('Error generating sitemap:', error);
    } finally {
        // Disconnect from MongoDB Atlas after generating the sitemap
        mongoose.disconnect();
    }
}

// Call the function to generate the sitemap
generateSitemap();
