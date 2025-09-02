// src/services/aiService.js
const { OpenAI } = require('openai');

class AIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  async generateTripItinerary(tripData) {
    try {
      const { tripDetails } = tripData;
      const prompt = this.buildItineraryPrompt(tripDetails);

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a travel planning assistant specializing in EV road trips. Provide detailed itineraries with hotel recommendations, charging stations, and route optimization."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const response = completion.choices[0].message.content;
      return this.parseItineraryResponse(response);

    } catch (error) {
      console.error('Error generating itinerary:', error);
      throw new Error('Failed to generate trip itinerary');
    }
  }

  buildItineraryPrompt(tripDetails) {
    const {
      startDate,
      fromLocation,
      toDestination,
      stops,
      maxDrivingDistance,
      evRange,
      hotelRequired,
      travelers,
      rooms
    } = tripDetails;

    let prompt = `Plan an EV road trip with the following details:

Start Date: ${new Date(startDate).toLocaleDateString()}
From: ${fromLocation}
To: ${toDestination}
Maximum driving distance per day: ${maxDrivingDistance} km
EV Range: ${evRange} km
Travelers: ${travelers}
Rooms needed: ${rooms}
Hotel required: ${hotelRequired ? 'Yes' : 'No'}`;

    if (stops && stops.length > 0) {
      prompt += `\nStops en route: ${stops.map(stop => stop.location).join(', ')}`;
    }

    prompt += `\n\nPlease provide:
1. A day-by-day itinerary
2. Recommended hotels for each overnight stop (include hotel name and city)
3. Suggested EV charging stations along the route
4. Total distance and estimated travel time
5. Key waypoints and attractions

Format the response as a structured JSON with the following structure:
{
  "totalDistance": number,
  "totalDuration": number,
  "dayByDay": [
    {
      "day": number,
      "date": "YYYY-MM-DD",
      "from": "location",
      "to": "location",
      "distance": number,
      "hotels": [
        {
          "name": "hotel name",
          "city": "city name",
          "reason": "why recommended"
        }
      ],
      "chargingStations": [
        {
          "name": "station name",
          "location": "location",
          "connectorTypes": ["Type2", "CCS"]
        }
      ]
    }
  ],
  "waypoints": [
    {
      "location": "location name",
      "purpose": "charging/hotel/attraction"
    }
  ]
}`;

    return prompt;
  }

  parseItineraryResponse(response) {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Extract hotels for API verification
        const hotels = [];
        if (parsed.dayByDay) {
          parsed.dayByDay.forEach(day => {
            if (day.hotels) {
              day.hotels.forEach(hotel => {
                hotels.push({
                  name: hotel.name,
                  location: hotel.city,
                  checkIn: day.date,
                  checkOut: this.calculateCheckOut(day.date),
                  verified: false
                });
              });
            }
          });
        }

        // Extract charging stations
        const chargingStations = [];
        if (parsed.dayByDay) {
          parsed.dayByDay.forEach(day => {
            if (day.chargingStations) {
              day.chargingStations.forEach(station => {
                chargingStations.push({
                  name: station.name,
                  location: station.location,
                  connectorTypes: station.connectorTypes || []
                });
              });
            }
          });
        }

        return {
          totalDistance: parsed.totalDistance || 0,
          totalDuration: parsed.totalDuration || 0,
          waypoints: parsed.waypoints || [],
          hotels: hotels,
          chargingStations: chargingStations,
          rawResponse: parsed
        };
      }
      
      throw new Error('No valid JSON found in response');
    } catch (error) {
      console.error('Error parsing AI response:', error);
      // Fallback: return basic structure
      return {
        totalDistance: 0,
        totalDuration: 0,
        waypoints: [],
        hotels: [],
        chargingStations: [],
        rawResponse: response
      };
    }
  }

  calculateCheckOut(checkInDate) {
    const date = new Date(checkInDate);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }
}

module.exports = new AIService();