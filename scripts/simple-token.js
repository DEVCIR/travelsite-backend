require('dotenv').config();
const https = require('https');

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

if (!CLERK_SECRET_KEY) {
    console.error('Error: CLERK_SECRET_KEY is not defined in your .env file');
    process.exit(1);
}

// Helper function to make HTTP requests
function makeRequest(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonResponse = JSON.parse(responseBody);
                    resolve(jsonResponse);
                } catch (e) {
                    reject(new Error(`Invalid JSON response: ${responseBody}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }

        req.end();
    });
}

// Step 1: List users
async function getUsers() {
    const options = {
        hostname: 'api.clerk.com',
        path: '/v1/users',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        }
    };

    try {
        const response = await makeRequest(options);

        if (!response.data || !Array.isArray(response.data)) {
            console.error('Unexpected response format:', response);
            return null;
        }

        return response.data;
    } catch (error) {
        console.error('Error getting users:', error.message);
        return null;
    }
}

// Step 2: Get a token
async function getToken(userId) {
    // First, get the client ID for the backend API
    const clientsOptions = {
        hostname: 'api.clerk.com',
        path: '/v1/clients?search=backend',
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json'
        }
    };

    try {
        const clientsResponse = await makeRequest(clientsOptions);

        if (!clientsResponse.data || !Array.isArray(clientsResponse.data) || clientsResponse.data.length === 0) {
            console.error('No backend client found. Creating a JWT client template token instead.');

            // Create a JWT template token directly
            const tokenOptions = {
                hostname: 'api.clerk.com',
                path: `/v1/users/${userId}/jwt`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            };

            const tokenResponse = await makeRequest(tokenOptions, {
                expires_in_seconds: 86400 // 24 hours
            });

            return tokenResponse.jwt;
        }

        // Found a backend client, use it to create a token
        const clientId = clientsResponse.data[0].id;

        const tokenOptions = {
            hostname: 'api.clerk.com',
            path: `/v1/clients/${clientId}/verify_tokens`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLERK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        };

        const tokenResponse = await makeRequest(tokenOptions, {
            user_id: userId,
            expires_in_seconds: 86400 // 24 hours
        });

        return tokenResponse.jwt;
    } catch (error) {
        console.error('Error getting token:', error.message);
        return null;
    }
}

// Main function
async function generateToken() {
    try {
        // Get users
        const users = await getUsers();

        if (!users || users.length === 0) {
            console.log('No users found in your Clerk application.');
            return;
        }

        // Display available users
        console.log('Available users:');
        users.forEach((user, index) => {
            const email = user.email_addresses && user.email_addresses.length > 0
                ? user.email_addresses[0].email_address
                : 'No email';
            console.log(`${index + 1}. ID: ${user.id} - Email: ${email}`);
        });

        // Get user ID from command line or use first user
        const userId = process.argv[2] || users[0].id;
        console.log(`\nGenerating token for user: ${userId}`);

        // Get token
        const token = await getToken(userId);

        if (!token) {
            console.error('Failed to generate token');
            return;
        }

        console.log('\n=== JWT Token Generated ===');
        console.log(`Token: ${token}`);
        console.log('\n--- Use this token in Postman ---');
        console.log('1. In the Headers tab, add:');
        console.log('   Key: Authorization');
        console.log(`   Value: Bearer ${token}`);
        console.log('\n2. Or in curl:');
        console.log(`curl -X GET http://localhost:8000/api/users/profile -H 'Authorization: Bearer ${token}'`);

    } catch (error) {
        console.error('Error:', error.message);
    }
}

generateToken();