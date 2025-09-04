// api/checkPassword.js
export default function handler(req, res) {
  const { password } = req.body;
  const securePassword = process.env.SECURE_PASSWORD; // This variable is only available on the server.

  if (password === securePassword) {
    res.status(200).json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Incorrect password.' });
  }
}