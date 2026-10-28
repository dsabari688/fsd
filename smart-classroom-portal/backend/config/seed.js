const User = require("../models/User");

const seedInitialData = async () => {
  try {
    const userCount = await User.countDocuments();
    if (userCount > 0) return;

    console.log("🌱 Initializing admin and teacher login credentials...");

    // 1. Create Admin User
    await User.create({
      name: "Admin User",
      email: "admin@classroom.com",
      password: "admin123",
      role: "admin",
    });

    // 2. Create Teacher User
    await User.create({
      name: "Teacher User",
      email: "teacher@classroom.com",
      password: "teacher123",
      role: "teacher",
    });

    console.log("✅ Credentials ready:");
    console.log("   Admin: admin@classroom.com / admin123");
    console.log("   Teacher: teacher@classroom.com / teacher123");
  } catch (err) {
    console.error("Error during initial data seed:", err.message);
  }
};

module.exports = seedInitialData;
