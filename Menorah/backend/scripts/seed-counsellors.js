/**
 * Seed script — creates 8 dummy counsellor profiles.
 * Run from backend folder:  node scripts/seed-counsellors.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const User      = require('../src/models/User');
const Counsellor = require('../src/models/Counsellor');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/menorah';

const availability = {
  monday:    { start: '09:00', end: '18:00', isAvailable: true  },
  tuesday:   { start: '09:00', end: '18:00', isAvailable: true  },
  wednesday: { start: '09:00', end: '18:00', isAvailable: true  },
  thursday:  { start: '09:00', end: '18:00', isAvailable: true  },
  friday:    { start: '09:00', end: '17:00', isAvailable: true  },
  saturday:  { start: '10:00', end: '14:00', isAvailable: false },
  sunday:    { start: '10:00', end: '14:00', isAvailable: false },
};

const COUNSELLORS = [
  {
    user: {
      firstName: 'Priya',
      lastName:  'Sharma',
      email:     'priya.sharma@menorah.dev',
      phone:     '+919876543210',
      gender:    'female',
      dateOfBirth: new Date('1985-03-12'),
      profileImage: 'https://randomuser.me/api/portraits/women/44.jpg',
    },
    profile: {
      licenseNumber:   'LIC-001-PRIYA',
      specialization:  'Anxiety & Depression',
      specializations: ['Anxiety', 'Depression', 'Stress Management', 'CBT'],
      experience:      9,
      bio:             'I am a licensed clinical psychologist with 9 years of experience helping individuals navigate anxiety, depression, and life transitions. I use evidence-based approaches including CBT and mindfulness to support lasting change.',
      languages:       ['English', 'Hindi'],
      hourlyRate:      1500,
      rating:          4.8,
      reviewCount:     124,
      totalSessions:   340,
      education: [{
        degree: 'M.Phil Clinical Psychology',
        institution: 'NIMHANS, Bengaluru',
        year: 2014,
      }],
    },
  },
  {
    user: {
      firstName: 'Arjun',
      lastName:  'Mehta',
      email:     'arjun.mehta@menorah.dev',
      phone:     '+919876543211',
      gender:    'male',
      dateOfBirth: new Date('1980-07-22'),
      profileImage: 'https://randomuser.me/api/portraits/men/32.jpg',
    },
    profile: {
      licenseNumber:   'LIC-002-ARJUN',
      specialization:  'Trauma & PTSD',
      specializations: ['Trauma', 'PTSD', 'Relationship Issues', 'EMDR'],
      experience:      14,
      bio:             'Specialising in trauma-informed care and EMDR therapy. I work with individuals who have experienced complex trauma, grief, or relationship difficulties, fostering resilience and emotional healing.',
      languages:       ['English', 'Hindi', 'Gujarati'],
      hourlyRate:      2000,
      rating:          4.9,
      reviewCount:     210,
      totalSessions:   580,
      education: [{
        degree: 'Ph.D Clinical Psychology',
        institution: 'University of Delhi',
        year: 2010,
      }],
    },
  },
  {
    user: {
      firstName: 'Neha',
      lastName:  'Kapoor',
      email:     'neha.kapoor@menorah.dev',
      phone:     '+919876543212',
      gender:    'female',
      dateOfBirth: new Date('1990-11-05'),
      profileImage: 'https://randomuser.me/api/portraits/women/68.jpg',
    },
    profile: {
      licenseNumber:   'LIC-003-NEHA',
      specialization:  'Child & Adolescent Therapy',
      specializations: ['Child Psychology', 'Adolescent Issues', 'ADHD', 'Family Therapy'],
      experience:      6,
      bio:             'Passionate about working with children and teens facing academic stress, social challenges, and emotional difficulties. I provide a safe, playful space where young minds can grow and heal.',
      languages:       ['English', 'Hindi'],
      hourlyRate:      1200,
      rating:          4.7,
      reviewCount:     88,
      totalSessions:   210,
      education: [{
        degree: 'M.Sc Applied Psychology',
        institution: 'Tata Institute of Social Sciences',
        year: 2018,
      }],
    },
  },
  {
    user: {
      firstName: 'Rohan',
      lastName:  'Verma',
      email:     'rohan.verma@menorah.dev',
      phone:     '+919876543213',
      gender:    'male',
      dateOfBirth: new Date('1983-05-18'),
      profileImage: 'https://randomuser.me/api/portraits/men/55.jpg',
    },
    profile: {
      licenseNumber:   'LIC-004-ROHAN',
      specialization:  'Career & Life Coaching',
      specializations: ['Career Counselling', 'Life Transitions', 'Burnout', 'Work-life Balance'],
      experience:      11,
      bio:             'Helping professionals deal with burnout, career crossroads, and life transitions. My coaching combines positive psychology with practical goal-setting strategies for sustainable wellbeing.',
      languages:       ['English', 'Hindi', 'Punjabi'],
      hourlyRate:      1800,
      rating:          4.6,
      reviewCount:     156,
      totalSessions:   420,
      education: [{
        degree: 'MBA + M.Sc Counselling Psychology',
        institution: 'XLRI Jamshedpur',
        year: 2012,
      }],
    },
  },
  {
    user: {
      firstName: 'Aisha',
      lastName:  'Khan',
      email:     'aisha.khan@menorah.dev',
      phone:     '+919876543214',
      gender:    'female',
      dateOfBirth: new Date('1988-09-30'),
      profileImage: 'https://randomuser.me/api/portraits/women/29.jpg',
    },
    profile: {
      licenseNumber:   'LIC-005-AISHA',
      specialization:  'Couples & Relationship Therapy',
      specializations: ['Couples Therapy', 'Premarital Counselling', 'Divorce Support', 'Communication Skills'],
      experience:      8,
      bio:             'Certified Gottman Method therapist specialising in couple dynamics, intimacy, and communication. I help couples build deeper connection or navigate separation with dignity and respect.',
      languages:       ['English', 'Hindi', 'Urdu'],
      hourlyRate:      2200,
      rating:          4.9,
      reviewCount:     180,
      totalSessions:   310,
      education: [{
        degree: 'M.Phil Counselling Psychology',
        institution: 'Jamia Millia Islamia',
        year: 2016,
      }],
    },
  },
  {
    user: {
      firstName: 'Vikram',
      lastName:  'Nair',
      email:     'vikram.nair@menorah.dev',
      phone:     '+919876543215',
      gender:    'male',
      dateOfBirth: new Date('1978-01-14'),
      profileImage: 'https://randomuser.me/api/portraits/men/78.jpg',
    },
    profile: {
      licenseNumber:   'LIC-006-VIKRAM',
      specialization:  'Addiction & Substance Abuse',
      specializations: ['Addiction Recovery', 'Substance Abuse', 'Motivational Interviewing', 'Relapse Prevention'],
      experience:      16,
      bio:             'Over 16 years supporting individuals on their recovery journey from substance dependence. I use a non-judgmental, motivational approach that respects each person\'s unique path to sobriety.',
      languages:       ['English', 'Hindi', 'Malayalam'],
      hourlyRate:      1600,
      rating:          4.7,
      reviewCount:     230,
      totalSessions:   680,
      education: [{
        degree: 'M.Sc Psychiatric Social Work',
        institution: 'NIMHANS, Bengaluru',
        year: 2008,
      }],
    },
  },
  {
    user: {
      firstName: 'Meera',
      lastName:  'Pillai',
      email:     'meera.pillai@menorah.dev',
      phone:     '+919876543216',
      gender:    'female',
      dateOfBirth: new Date('1992-04-25'),
      profileImage: 'https://randomuser.me/api/portraits/women/90.jpg',
    },
    profile: {
      licenseNumber:   'LIC-007-MEERA',
      specialization:  'Mindfulness & Stress Management',
      specializations: ['Mindfulness-Based Therapy', 'Stress Management', 'Sleep Issues', 'Self-Esteem'],
      experience:      5,
      bio:             'Integrating mindfulness, yoga philosophy, and evidence-based psychology to help clients manage chronic stress, improve sleep, and build lasting self-compassion in everyday life.',
      languages:       ['English', 'Hindi', 'Malayalam', 'Tamil'],
      hourlyRate:      1000,
      rating:          4.5,
      reviewCount:     62,
      totalSessions:   140,
      education: [{
        degree: 'M.A Clinical Psychology',
        institution: 'Christ University, Bengaluru',
        year: 2019,
      }],
    },
  },
  {
    user: {
      firstName: 'Sameer',
      lastName:  'Joshi',
      email:     'sameer.joshi@menorah.dev',
      phone:     '+919876543217',
      gender:    'male',
      dateOfBirth: new Date('1975-12-08'),
      profileImage: 'https://randomuser.me/api/portraits/men/12.jpg',
    },
    profile: {
      licenseNumber:   'LIC-008-SAMEER',
      specialization:  'Grief & Loss Counselling',
      specializations: ['Grief Counselling', 'Bereavement', 'Existential Therapy', 'Depression'],
      experience:      19,
      bio:             'A seasoned therapist with nearly two decades of experience supporting individuals through grief, bereavement, and existential crises. I offer compassionate, non-directive therapy that honours each client\'s unique journey.',
      languages:       ['English', 'Hindi', 'Marathi'],
      hourlyRate:      2500,
      rating:          5.0,
      reviewCount:     290,
      totalSessions:   820,
      education: [{
        degree: 'Ph.D Counselling Psychology',
        institution: 'University of Mumbai',
        year: 2006,
      }],
    },
  },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ Connected to MongoDB');

  const passwordHash = await bcrypt.hash('Counsellor@123', 12);
  let created = 0;
  let skipped = 0;

  for (const data of COUNSELLORS) {
    try {
      // Skip if user already exists
      const existing = await User.findOne({ email: data.user.email });
      if (existing) {
        console.log(`⏭  Skipped (already exists): ${data.user.email}`);
        skipped++;
        continue;
      }

      // Create user account
      const user = await User.create({
        ...data.user,
        password:        passwordHash,
        role:            'counsellor',
        isEmailVerified: true,
        isPhoneVerified: true,
        isActive:        true,
      });

      // Create counsellor profile
      await Counsellor.create({
        user:          user._id,
        ...data.profile,
        availability,
        sessionDuration: 60,
        timezone:        'Asia/Kolkata',
        currency:        'INR',
        isVerified:      true,
        isActive:        true,
        isAvailable:     true,
        commissionRate:  20,
      });

      console.log(`✅ Created counsellor: ${data.user.firstName} ${data.user.lastName}`);
      created++;
    } catch (err) {
      console.error(`❌ Error creating ${data.user.email}:`, err.message);
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}`);
  await mongoose.disconnect();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
