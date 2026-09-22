const admin = require('firebase-admin');

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided, authorization denied.' });
    }

    const token = authHeader.split(' ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; 
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Token is invalid or expired.' });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    const userData = userDoc.data();
    if (userData.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }

    req.userData = userData;
    next();
  } catch (error) {
    console.error('Admin verification error:', error);
    return res.status(500).json({ message: 'Server error verifying admin role.' });
  }
};

module.exports = { verifyToken, verifyAdmin };