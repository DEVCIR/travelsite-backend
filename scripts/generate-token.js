require('dotenv').config();
const fetch = require('node-fetch');

async function generateToken() {
  try {
    // Configuration
    const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
    const CLERK_API_BASE = 'https://api.clerk.dev/v1';
    
    if (!CLERK_SECRET_KEY) {
      throw new Error('CLERK_SECRET_KEY missing in .env file');
    }

    // 1. Get Users
    const usersResponse = await fetch(`${CLERK_API_BASE}/users?limit=10`, {
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!usersResponse.ok) {
      throw new Error(`Failed to fetch users: ${usersResponse.statusText}`);
    }

    const users = await usersResponse.json();

    if (users.length === 0) {
      console.log('No users found. Create users in Clerk Dashboard first.');
      return;
    }

    // Display users
    console.log('Available users:');
    users.forEach((user, index) => {
      const email = user.email_addresses.find(e => e.id === user.primary_email_address_id)?.email_address || 'No email';
      console.log(`${index + 1}. ID: ${user.id} - Email: ${email}`);
    });

    // 2. Select User
    const userId = process.argv[2] || users[0].id;
    const selectedUser = users.find(u => u.id === userId) || users[0];
    const userEmail = selectedUser.email_addresses.find(e => e.id === selectedUser.primary_email_address_id)?.email_address || 'Unknown';

    // 3. Create Session
    const sessionResponse = await fetch(`${CLERK_API_BASE}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        expire_in_seconds: 86400 // 24 hours
      })
    });

    if (!sessionResponse.ok) {
      throw new Error(`Session creation failed: ${sessionResponse.statusText}`);
    }

    const session = await sessionResponse.json();

    // 4. Get Token
    const tokenResponse = await fetch(`${CLERK_API_BASE}/sessions/${session.id}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!tokenResponse.ok) {
      throw new Error(`Token generation failed: ${tokenResponse.statusText}`);
    }

    const { jwt } = await tokenResponse.json();

    console.log('\n=== TOKEN GENERATED ===');
    console.log(`User: ${userEmail} (${userId})`);
    console.log(`Token: ${jwt}`);
    console.log('\nUsage:');
    console.log(`curl -H "Authorization: Bearer ${jwt}" YOUR_API_ENDPOINT`);

  } catch (error) {
    console.error('\nError:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Verify CLERK_SECRET_KEY in .env matches your instance');
    console.log('2. Ensure user exists in Clerk Dashboard');
    console.log('3. Check network connection');
    console.log('4. Verify Clerk API status: https://status.clerk.com');
  }
}

// Run the generator
generateToken();