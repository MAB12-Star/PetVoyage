const Joi = require('joi');

module.exports.countrySchema = Joi.object ({
    country: Joi.string().valid(
        'United States',
        'Canada',
        'Mexico',
        'Germany',
        'France',
        'United Kingdom',
        'Australia',
        // Add more countries as needed
    ).required()
})