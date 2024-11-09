// seed.js
const mongoose = require('mongoose');
const Airline = require('./models/airline'); // Adjust the path as necessary

// Replace with your MongoDB connection string
const mongoURI = 'mongodb://localhost:27017/PetVoyage';

// Sample airline data without _id
const airlines = [
  {
    airlineCode: "AM",
    petPolicyURL: "https://www.aeromexico.com/pet-policy"
  },
  {
    airlineCode: "DL",
    petPolicyURL: "https://www.delta.com/pet-policy"
  },
  {
    airlineCode: "KE",
    petPolicyURL: "https://www.koreanair.com/pet-policy"
  },
  {
    airlineCode: "KL",
    petPolicyURL: "https://www.klm.com/pet-policy"
  },
  {
    airlineCode: "VS",
    petPolicyURL: "https://www.virginatlantic.com/pet-policy"
  },
  {
    airlineCode: "PP",
    petPolicyURL: "https://www.jetaviation.com/pet-policy"
  },
  {
    airlineCode: "AC",
    petPolicyURL: "https://www.aircanada.com/pet-policy"
  },
  {
    airlineCode: "F9",
    petPolicyURL: "https://www.flyfrontier.com/pet-policy"
  },
  {
    airlineCode: "UA",
    petPolicyURL: "https://www.united.com/pet-policy"
  },
  {
    airlineCode: "WN",
    petPolicyURL: "https://www.southwest.com/pet-policy"
  },
  {
    airlineCode: "AA",
    petPolicyURL: "https://www.aa.com/pet-policy"
  },
  {
    airlineCode: "BA",
    petPolicyURL: "https://www.britishairways.com/pet-policy"
  },
  {
    airlineCode: "JL",
    petPolicyURL: "https://www.jal.co.jp/pet-policy"
  },
  {
    airlineCode: "QR",
    petPolicyURL: "https://www.qatarairways.com/pet-policy"
  },
  {
    airlineCode: "VB",
    petPolicyURL: "https://www.vivaaerobus.com/pet-policy"
  },
  {
    airlineCode: "Y4",
    petPolicyURL: "https://www.volaris.com/pet-policy"
  },
  {
    airlineCode: "AS",
    petPolicyURL: "https://www.alaskaair.com/pet-policy"
  },
  {
    airlineCode: "HA",
    petPolicyURL: "https://www.hawaiianairlines.com/pet-policy"
  },
  {
    airlineCode: "QF",
    petPolicyURL: "https://www.qantas.com/pet-policy"
  },
  {
    airlineCode: "5D",
    petPolicyURL: "https://www.aeromexicoconnect.com/pet-policy"
  },
  {
    airlineCode: "AF",
    petPolicyURL: "https://www.airfrance.com/pet-policy"
  },
  {
    airlineCode: "AZ",
    petPolicyURL: "https://www.alitalia.com/pet-policy"
  },
  {
    airlineCode: "IB",
    petPolicyURL: "https://www.iberia.com/pet-policy"
  },
  {
    airlineCode: "LA",
    petPolicyURL: "https://www.latam.com/pet-policy"
  }
];

const seedDatabase = async () => {
  try {
    // Connect to the MongoDB database
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    // Clear existing data
    await Airline.deleteMany({});

    // Insert sample data
    const result = await Airline.insertMany(airlines);
    console.log('Sample data seeded successfully:', result);
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    // Close the connection
    mongoose.connection.close();
  }
};

// Run the seed function
seedDatabase();