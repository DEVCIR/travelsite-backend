require('dotenv').config();
const axios = require('axios');

// If you don't have axios installed, run: npm install axios

async function getTokenWithRestAPI() {
  try {
    const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    
    if (!CLERK_SECRET_KEY) {
      console.error('Error: CLERK_SECRET_KEY is not defined in your .env file');
      return;
    }
    
    // Step 1: List users to get a user ID
    const usersResponse = await axios.get('https://api.clerk.dev/v1/users', {
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const users = usersResponse.data.data;
    
    if (users.length === 0) {
      console.log('No users found in your Clerk application.');
      return;
    }
    
    // Display available users
    console.log('Available users:');
    users.forEach((user, index) => {
      const email = user.email_addresses?.[0]?.email_address || 'No email';
      console.log(`${index + 1}. ID: ${user.id} - Email: ${email}`);
    });
    
    // Get user ID from command line or use first user
    const userId = process.argv[2] || users[0].id;
    
    // Step 2: Create a session for the user
    const sessionResponse = await axios.post(`https://api.clerk.dev/v1/sessions`, {
      user_id: userId,
      expires_in_seconds: 86400 // 24 hours
    }, {
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const sessionId = sessionResponse.data.id;
    
    // Step 3: Get a token for the session
    const tokenResponse = await axios.post(`https://api.clerk.dev/v1/sessions/${sessionId}/tokens`, {}, {
      headers: {
        'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    const token = tokenResponse.data.jwt;
    
    console.log('\n=== JWT Token Generated ===');
    console.log(`User ID: ${userId}`);
    console.log(`Token: ${token}`);
    console.log('\n--- Use this token in Postman ---');
    console.log('1. In the Headers tab, add:');
    console.log('   Key: Authorization');
    console.log(`   Value: Bearer ${token}`);
    console.log('\n2. Or in curl:');
    console.log(`curl -X GET http://localhost:8000/api/users/profile -H 'Authorization: Bearer ${token}'`);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    console.error('\nTips:');
    console.error('- Make sure your CLERK_SECRET_KEY is correct in .env');
    console.error('- Verify you have created users in your Clerk application');
    console.error('- Check that the Clerk API endpoints are correct');
  }
}

getTokenWithRestAPI();