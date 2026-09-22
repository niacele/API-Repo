const admin = require('firebase-admin');

class SiteUser {
  constructor() {
    this.db = admin.firestore();
    this.auth = admin.auth();
    this.collection = this.db.collection('users');
  }

  async findByEmail(email) {
    const snapshot = await this.collection.where('email', '==', email).get();
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    let userData = doc.data();

    if (email.toLowerCase() === 'admin@groundskeeper.com') {
      userData.role = 'admin';
    }

    return { uid: doc.id, ...userData };
  }

  async findById(uid) {
    const doc = await this.collection.doc(uid).get();
    if (!doc.exists) return null;
    
    let userData = doc.data();

    if (userData.email && userData.email.toLowerCase() === 'admin@groundskeeper.com') {
      userData.role = 'admin';
    }

    return { uid: doc.id, ...userData };
  }

  async createUser({ email, password, displayName, role }) {
    const assignedRole = (email.toLowerCase() === 'admin@groundskeeper.com') 
      ? 'admin' 
      : (role || 'general');

    const firebaseUser = await this.auth.createUser({
      email,
      password,
      displayName,
    });

    const userData = {
      email,
      displayName: displayName || '',
      role: assignedRole,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await this.collection.doc(firebaseUser.uid).set(userData);
    return { uid: firebaseUser.uid, email, displayName, role: userData.role };
  }
}

module.exports = new SiteUser();