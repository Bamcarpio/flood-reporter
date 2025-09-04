// Vercel automatically deploys this file as a serverless function at the /api/get-password endpoint.
// It is the secure way to access a Vercel environment variable and send it to your front-end.

export default function handler(request, response) {
  try {
    const password = process.env.REACT_APP_PASSWORD_KEY;

    if (!password) {
      // If the environment variable isn't set, return an error.
      return response.status(500).json({ message: 'Password environment variable not set.' });
    }

    // This is the secure part: the password is read on the server.
    // We send it back as JSON. In a real-world scenario, you might not
    // send the raw password, but for a simple gate like this, it's fine.
    response.status(200).json({ password });
  } catch (error) {
    // Handle any unexpected errors.
    console.error('Error fetching password:', error);
    response.status(500).json({ message: 'Internal Server Error' });
  }
}