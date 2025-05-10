const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Review = require('./review');

// Define the schema for storing airline data
const airlineSchema = new mongoose.Schema({
    airlineCode: { type: String, required: true, unique: true }, // IATA code of the airline
    petPolicyURL: { type: String, required: false },             // URL to the airline's pet policy page
    airlineURL: { type: String }, 
    microchip: {
        type: String,
        enum: ['yes', 'no'],
      },  
      healthCertificate: {
        type: String,
        enum: ['yes', 'no'],
      },                          // Main airline website
    logo: {type: String},
    name: { type: String, required: true },                      // Airline name
    slug: { type: String, required: true, unique: true },         // Slug for URL-friendly names
    body: { type: String },                                      // Placeholder body text
    reviews: [
        {
            type: Schema.Types.ObjectId,
            ref: 'Review'                                        // Reference to reviews
        }
    ],
    author: {
        type: Schema.Types.ObjectId,
        ref: 'User'                                              // Reference to author
    },
    PetPolicySummary: { type: String, default: "" },             // Summary of the pet policy
    ImprovedPetPolicySummary: { type: String, default: "" },      // Improved/HTML formatted pet policy summary
    
    inCargoAnimals: {   
        type: [String],
        enum: ['Cat', 'Dog', 'Bird', 'Reptile'],
        default: []
    },
    inCompartmentAnimals: {
        type: [String],
        enum: ['Cat', 'Dog', 'Bird', 'Reptile'],
        default: []
    },
    dangerousBreeds:{
        type: String,
        enum: ['yes', 'no'],
      }, 
    brachycephalic:{
        type: String,
        enum: ['yes', 'no'],
      }, 
    serviceAnimals: {
        type: String,
        enum: ['yes', 'no'],
      }, 
    esAnimals:{
        type: String,
        enum: ['yes', 'no'],
      }, 
    petShipping:{
        type: String,
        enum: ['yes', 'no'],
      }, 

      dangerousBreedList:{
        type:String,
          default: "",
      },
      brachycephalicBreedList:{
        type:String,
        default: "",
      },
      inCompartmentDetails:{
        type:String,
        default: "",
      },
      inCargoDetails:{
        type:String,
        default: "",
      },
      serviceAnimalDetails:{
        type:String,
        default: "",
      },
      carrierCargoDetails:{
        type:String,
        default: "",
      },
      carrierCompartmentDetails:{
        type:String,
        default: "",
      },
      esaDetails:{
        type:String,
        default: "",
      },
    healthVaccinations: { 
        type: [String], 
        enum: [
            'Rabies', 
            'Internal/External parasites', 
            'Distemper', 
            'Adenovirus', 
            'Parvovirus', 
            'Parainfluenza'
        ],
        default: []
    },
});

// Create a pre-save hook to generate the slug before saving the document
airlineSchema.pre('save', function(next) {
    // Generate the slug by converting the name to lowercase and replacing spaces with hyphens
    if (this.name) {
        this.slug = this.name.toLowerCase().replace(/ /g, '-').replace(/[^\w-]/g, '');
    }
    next();
});

module.exports = mongoose.model('Airline', airlineSchema);
