const admin = require('firebase-admin');
const axios = require('axios');

exports.register = async (req, res) => {
  console.log("--> Registration request received:", req.body);
  try {
    const { email, password, displayName, siteCode } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ message: 'Please provide email, password, and display name.' });
    }

    const targetSiteCode = siteCode || 'default_site';
    const db = admin.firestore();

    const existingAdminsSnapshot = await db.collection('users')
      .where('siteCode', '==', targetSiteCode)
      .where('role', '==', 'admin')
      .get();

    if (existingAdminsSnapshot.size >= 3) {
      return res.status(409).json({ 
        message: 'Registration failed. Maximum limit of 3 administrators reached for this site.' 
      });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName
    });

    const userData = {
      uid: userRecord.uid,
      email,
      displayName,
      role: 'admin',
      siteCode: targetSiteCode,
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
        siteCode: targetSiteCode
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

    const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyCzgCbT27qyAGR8_yOkkC_E5HPivCi0uLo";
    const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;

    const firebaseResponse = await axios.post(loginUrl, {
      email,
      password,
      returnSecureToken: true
    });

    const { idToken, localId } = firebaseResponse.data;

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
        siteCode: userData.siteCode || 'default_site'
      }
    });
  } catch (error) {
    console.error('Login error details:', error.response?.data?.error || error.message);
    return res.status(401).json({ 
      message: 'Invalid email or password.',
      details: error.response?.data?.error?.message || error.message 
    });
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

    const db = admin.firestore();
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(404).json({ message: 'User profile not found.' });
    }

    const currentEmail = userDoc.data().email;

    const apiKey = process.env.FIREBASE_API_KEY || "AIzaSyCzgCbT27qyAGR8_yOkkC_E5HPivCi0uLo";
    const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    
    await axios.post(loginUrl, {
      email: currentEmail,
      password,
      returnSecureToken: true
    });

    await admin.auth().updateUser(uid, { email: newEmail });
    await db.collection('users').doc(uid).update({ email: newEmail });

    return res.status(200).json({ message: 'Email updated successfully!' });
  } catch (error) {
    console.error('Change email error:', error.response?.data || error.message);
    
    const errorCode = error.response?.data?.error?.message;
    if (errorCode === 'INVALID_PASSWORD' || errorCode === 'INVALID_LOGIN_CREDENTIALS') {
      return res.status(401).json({ message: 'Incorrect password provided.' });
    }

    return res.status(500).json({ message: 'Failed to update email', error: error.message });
  }
};