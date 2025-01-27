const fs = require('fs');
const path = require('path');

// Path to the test.ejs file
const inputFilePath = path.join(__dirname, 'test.ejs');

// Path to the output HTML file
const outputFilePath = path.join(__dirname, 'output.html');

// Function to extract links from test.ejs
function extractLinks(fileContent) {
    // Match all href values in <a> tags using a regular expression
   const regex = /(https?:\/\/[^\s]+)/g;
    const links = [];
    let match;

    // Iterate through all matches and push into the links array
    while ((match = regex.exec(fileContent)) !== null) {
        links.push({ href: match[1], text: match[2] });
    }

    return links;
}

// Function to generate the HTML
function generateHTML(links) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generated Links Page</title>
</head>
<body>
    <h1>Generated Links</h1>
    <ul>
        ${links
            .map(link => `<li><a href="${link.href}" class="text-decoration-none">${link.href}</a></li>`)
            .join('\n')}
    </ul>
</body>
</html>
    `;
    return html;
}

// Read the test.ejs file
fs.readFile(inputFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading test.ejs:', err);
        return;
    }

    // Extract links from the file
    const links = extractLinks(data);

    if (links.length === 0) {
        console.error('No links found in test.ejs.');
        return;
    }

    // Generate the HTML
    const htmlContent = generateHTML(links);

    // Write the HTML to the output file
    fs.writeFile(outputFilePath, htmlContent, 'utf8', err => {
        if (err) {
            console.error('Error writing output.html:', err);
            return;
        }

        console.log(`HTML file generated successfully: ${outputFilePath}`);
    });
});
