const admin = require('firebase-admin');
const axios = require('axios');

/**
 * Handles Google SSO Authentication token verification.
 * Links or merges with existing email/password user profile if existing.
 */
exports.googleSso = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required.' });
    }

    let uid, email, name, picture;

    // 1. Verify token with Firebase Admin SDK or Google OAuth endpoint
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      uid = decodedToken.uid;
      email = decodedToken.email || decodedToken.firebase?.identities?.['google.com']?.[0];
      name = decodedToken.name;
      picture = decodedToken.picture;
    } catch (firebaseErr) {
      console.warn('[SSO] Firebase token verification failed, checking Google OAuth info endpoint...');
    }

    // Fallback or explicit check via Google tokeninfo if email is still missing
    if (!email) {
      try {
        const googleResponse = await axios.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        const googleData = googleResponse.data;
        email = googleData.email;
        name = name || googleData.name;
        picture = picture || googleData.picture;
      } catch (googleErr) {
        console.error('[SSO] Google tokeninfo lookup failed:', googleErr.message);
      }
    }

    const safeEmail = (email || '').trim().toLowerCase();
    console.log(`[SSO] Verified Token for Auth UID: ${uid}, Resolved Email: ${safeEmail}`);

    const db = admin.firestore();
    let userData;
    let finalUid = uid;

    // 2. SMART MERGE: Check if an account with this email already exists in Firestore!
    let existingUserQuery = null;
    if (safeEmail.length > 0) {
      existingUserQuery = await db.collection('users')
        .where('email', '==', safeEmail)
        .limit(1)
        .get();
    }

    if (existingUserQuery && !existingUserQuery.empty) {
      // Found existing account registered via email/password or previous login!
      const existingDoc = existingUserQuery.docs[0];
      userData = existingDoc.data();
      finalUid = existingDoc.id; // Keep the original user's Firestore ID and siteCode!
      
      console.log(`[SSO] Successfully merged Google SSO with existing user profile: ${finalUid} (Site: ${userData.siteCode})`);

      await db.collection('users').doc(finalUid).set({
        photoUrl: picture || userData.photoUrl || '',
        lastLoginAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    } else {
      // 3. Check if document by UID already exists
      const userRef = db.collection('users').doc(uid);
      let userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.log(`[SSO] No existing email match. Provisioning new admin user profile for UID: ${uid}`);

        userData = {
          uid,
          email: safeEmail,
          displayName: name || (safeEmail ? safeEmail.split('@')[0] : 'Admin User'),
          photoUrl: picture || '',
          role: 'admin',
          siteCode: 'default_site',
          preferences: {
            realTimeNotifications: true,
            emailReports: false
          },
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        await userRef.set(userData);
      } else {
        userData = userDoc.data();
        finalUid = userDoc.id;
      }
    }

    return res.status(200).json({
      message: 'Google SSO Authentication successful!',
      token: idToken,
      user: {
        uid: finalUid,
        email: userData.email || safeEmail,
        displayName: userData.displayName || name || '',
        role: userData.role || 'admin',
        siteCode: userData.siteCode || 'default_site'
      }
    });
  } catch (error) {
    console.error('[SSO Error Critical]:', error.response?.data || error.message);
    return res.status(401).json({
      message: 'Google SSO verification failed.',
      error: error.message
    });
  }
};

/**
 * Registers a new admin account with site limits enforcement.
 */
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
      preferences: {
        realTimeNotifications: true,
        emailReports: false
      },
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

/**
 * Authenticates user credentials via Firebase Identity Toolkit.
 */
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

/**
 * Retrieves profile document for the authenticated user.
 */
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

/**
 * Updates user account email in Firebase Auth and Firestore.
 */
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

/**
 * Updates notification preferences (realTimeNotifications & emailReports) for the specified admin.
 */
exports.updatePreferences = async (req, res) => {
  try {
    const { userId, realTimeNotifications, emailReports } = req.body;
    const targetUid = userId || req.user?.uid;

    if (!targetUid) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    const db = admin.firestore();
    await db.collection('users').doc(targetUid).set({
      preferences: {
        realTimeNotifications: Boolean(realTimeNotifications),
        emailReports: Boolean(emailReports)
      }
    }, { merge: true });

    return res.status(200).json({
      success: true,
      message: 'Notification preferences updated successfully.'
    });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return res.status(500).json({ success: false, message: 'Failed to update preferences.' });
  }
};