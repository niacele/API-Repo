const admin = require('firebase-admin');
const axios = require('axios');

exports.register = async (req, res) => {
  try {
    const { email, password, displayName, siteId } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ message: 'Please provide email, password, and display name.' });
    }

    const targetSiteId = siteId || 'default_site';
    const db = admin.firestore();

    // Check existing admins limit
    const existingAdminsSnapshot = await db.collection('users')
      .where('siteId', '==', targetSiteId)
      .where('role', '==', 'admin')
      .get();

    if (existingAdminsSnapshot.size >= 3) {
      return res.status(409).json({ 
        message: 'Registration failed. Maximum limit of 3 administrators reached for this site.' 
      });
    }

    // Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName
    });

    // Save profile in Firestore
    const userData = {
      uid: userRecord.uid,
      email,
      displayName,
      role: 'admin',
      siteId: targetSiteId,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('users').doc(userRecord.uid).set(userData);

    return res.status(201).json({
      message: 'Admin account created successfully!',
      user: {
        uid: userRecord.uid,
        email,
        displayName,
        role: 'admin',
        siteId: targetSiteId
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Registration failed', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password.' });
    }

    const apiKey = process.env.FIREBASE_API_KEY; 
    const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const firebaseResponse = await axios.post(loginUrl, {
      email,
      password,
      returnSecureToken: true
    });

    const { idToken, localId } = firebaseResponse.data;

    // Retrieve user profile from Firestore
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(localId).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    const userData = userDoc.data();

    return res.status(200).json({
      message: 'Admin login successful!',
      token: idToken,
      user: {
        uid: localId,
        email: userData.email,
        displayName: userData.displayName || '',
        role: userData.role || 'admin',
        siteId: userData.siteId || 'default_site'
      }
    });
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    return res.status(401).json({ message: 'Invalid email or password.' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const uid = req.user.uid;
    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.status(200).json({
      message: 'Profile fetched successfully',
      user: userDoc.data()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(500).json({ message: 'Server error fetching profile.' });
  }
};

exports.changeEmail = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { newEmail, password } = req.body;

    if (!newEmail || !password) {
      return res.status(400).json({ message: 'New email and password are required.' });
    }

    const apiKey = process.env.FIREBASE_API_KEY;
    const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    
    // Re-verify existing password
    await axios.post(loginUrl, {
      email: req.user.email,
      password,
      returnSecureToken: true
    });

    // Update Firebase Auth & Firestore
    await admin.auth().updateUser(uid, { email: newEmail });

    const db = admin.firestore();
    await db.collection('users').doc(uid).update({ email: newEmail });

    return res.status(200).json({ message: 'Email updated successfully!' });
  } catch (error) {
    console.error('Change email error:', error.response?.data || error.message);
    
    if (error.response?.data?.error?.message === 'INVALID_PASSWORD') {
      return res.status(401).json({ message: 'Incorrect password provided.' });
    }

    return res.status(500).json({ message: 'Failed to update email', error: error.message });
  }
};