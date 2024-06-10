const express = require("express");
const mysql = require("mysql2");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const nodemailer = require('nodemailer');
const uuid = require('uuid');
const cron = require('node-cron');
const PORT = process.env.PORT || 8080;
const axios = require('axios');
const stripe = require('stripe')('sk_test_51LoS3iSGyKMMAZwstPlmLCEi1eBUy7MsjYxiKsD1lT31LQwvPZYPvqCdfgH9xl8KgeJoVn6EVPMgnMRsFInhnnnb00WhKhMOq7');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const QRCode = require('qrcode');
const fs = require('fs');

// URL Constants
const BASE_URL = 'https://6f35-122-172-85-200.ngrok-free.app';
const SUCCESS_URL = `${BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}&sender_id=`;
const CANCEL_URL = `${BASE_URL}/cancel`;
const TICKET_URL = `${BASE_URL}/tickets/`;
const DOCUMENT_URL = `${BASE_URL}/documents/`;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(session({
  key: "userId",
  secret: "Englishps4",
  resave: false,
  saveUninitialized: false,
  cookie: {
    expires: 60 * 60 * 24 * 12,
  },
}));

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "DELETE", "PUT"],
  credentials: true,
}));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const connection = mysql.createPool({
  connectionLimit: 10, // Maximum number of connections in the pool
  host: "localhost",
  user: "root",
  password: "Englishps#4",
  database: "kisar",
});

connection.getConnection((err) => {
  if (err) {
    console.error("Error connecting to MySQL database: ", err);
  } else {
    console.log("Connected to MySQL database");
  }
});

// GET endpoint for testing
app.get('/', (req, res) => {
  res.send('KISAR bakc-end working!');
});


const verifyjwt = (req, res) => {
  const token = req.headers["x-access-token"];

  if (!token) {
    res.send("no token unsuccessfull");
  } else {
    jwt.verify(token, "jwtsecret", (err, decoded) => {
      if (err) {
        res.json({ auth: false, message: "u have failed to auth" });
      } else {
        req.user_id = decoded.id;
      }
    });
  }
};

app.get("/userAuth", verifyjwt, (req, res) => {});

app.get("/login", (req, res) => {
  if (req.session.user) {
    res.send({ loggedIn: true, user: req.session.user });
  } else {
    res.send({ loggedIn: false });
  }
});

app.post("/login", (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  connection.query(
    "SELECT * FROM admins WHERE email = ?",
    email,
    (err, result) => {
      if (err) {
        res.send({ err: err });
      }
      if (result.length > 0) {
        bcrypt.compare(password, result[0].password, (error, response) => {
          if (response) {
            const id = result[0].id;
            const token = jwt.sign({ id }, "jwtsecret", {
              expiresIn: 86400,
            });

            connection.query(
              `update admins set jwt = "${token}" where email = "${email}" `,
              (err, result) => {
                if (err) console.log(err);
                console.log(result);
              }
            );
            req.session.user = result;
            res.json({ auth: true, token: token, result: result });
          } else {
            res.json({ auth: false, message: "Email or password is wrong" });
          }
        });
      } else {
        res.json({ auth: false, message: "User does not exist" });
      }
    }
  );
});

app.get('/users/display', (req, res) => {
  const query = 'SELECT user_id, CONCAT(user_honorific, " ", user_first_name, " ", user_middle_name, " ", user_last_name) AS full_name, user_phone, user_honorific, user_first_name, user_middle_name, user_last_name, user_email, user_med_council_number, user_category, user_type, user_city, user_state_of_practice, user_payment_status, user_registration_type FROM users';
  connection.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching users:', err);
          res.status(500).send('Error fetching users');
          return;
      }
      res.json(results);
  });
});

app.post('/create-session', (req, res) => {
  const { title } = req.body;
  const startTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Current time
  let endTime = new Date().toISOString().slice(0, 19).replace('T', ' '); // Current time

  const sql = 'INSERT INTO session (start_time, end_time, title) VALUES (?, ?, ?)';
  connection.query(sql, [startTime, endTime, title], (err, result) => {
    if (err) {
      console.error('Error creating session:', err);
      res.status(500).json({ error: 'Error creating session' });
    } else {
      console.log('Session created successfully');
      res.status(200).json({ message: 'Session created successfully', sessionId: result.insertId });
    }
  });
});


app.post('/api/addMember', (req, res) => {
  const {
      user_honorific,
      user_first_name,
      user_middle_name,
      user_last_name,
      user_email,
      user_phone,
      user_med_council_number,
      user_category,
      user_type,
      user_package_id,
      user_city,
      user_state_of_practice
  } = req.body;

  console.log('Received user category:', user_category);

  // Ensure that honorific and category values fit within the defined length
  const truncated_honorific = user_honorific.substring(0, 10);
  const truncated_category = user_category.substring(0, 10);

  console.log('Truncated user category:', truncated_category);

  const newUser = {
      user_honorific: truncated_honorific,
      user_first_name,
      user_middle_name,
      user_last_name,
      user_email,
      user_phone,
      user_med_council_number,
      user_category: truncated_category,
      user_type,
      user_package_id,
      user_city,
      user_state_of_practice
  };

  console.log('New user data:', newUser);

  const sql = 'INSERT INTO users SET ?';

  connection.query(sql, newUser, (err, result) => {
      if (err) {
          console.error('Error inserting member into users table:', err);
          res.status(500).send('Error adding member');
          return;
      }
      console.log('New member added successfully:', result);
      res.status(200).send('Member added successfully');
  });
});

// Endpoint to get active sessions
app.get('/api/sessions/active', (req, res) => {
  const query = 'SELECT * FROM session WHERE active = 1';
  connection.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching active sessions:', err);
          res.status(500).json({ error: 'Failed to fetch active sessions' });
          return;
      }
      res.json(results);
  });
});

// Endpoint to get inactive sessions
app.get('/api/sessions/inactive', (req, res) => {
  const query = 'SELECT * FROM session WHERE active = 0';
  connection.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching inactive sessions:', err);
          res.status(500).json({ error: 'Failed to fetch inactive sessions' });
          return;
      }
      res.json(results);
  });
});

// Endpoint to end a session
app.put('/api/sessions/end/:id', (req, res) => {
  const sessionId = req.params.id;
  const query = 'UPDATE session SET active = 0 WHERE session_id = ?';
  connection.query(query, [sessionId], (err, results) => {
      if (err) {
          console.error('Error ending session:', err);
          res.status(500).json({ error: 'Failed to end session' });
          return;
      }
      res.json({ message: 'Session ended successfully' });
  });
});

app.post('/api/events/create', (req, res) => {
  const { title, start_time, end_time } = req.body;
  const query = 'INSERT INTO event (title, start_time, end_time) VALUES (?, ?, ?)';
  connection.query(query, [title, start_time, end_time], (err, results) => {
      if (err) {
          console.error('Error creating event:', err);
          res.status(500).send('Error creating event');
      } else {
          res.status(201).send('Event created successfully');
      }
  });
});

app.post('/api/user/login/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    // Get the active event ID
    const [rows, fields] = await connection.promise().query('SELECT event_id FROM event WHERE active = 1');

    if (rows.length > 0) {
      const eventId = rows[0].event_id;

      // Check if the user is already logged in to the event
      const [existingRows] = await connection.promise().query('SELECT * FROM event_users WHERE event_id = ? AND user_id = ?', [eventId, userId]);

      if (existingRows.length > 0) {
        // User is already logged in, return a message
        res.status(400).json({ message: 'User is already logged in to the event' });
      } else {
        // Insert the user login into the event_users table
        const [result] = await connection.promise().query('INSERT INTO event_users (event_id, user_id, login_time) VALUES (?, ?, NOW())', [eventId, userId]);

        if (result.affectedRows === 1) {
          res.status(200).json({ message: 'User logged in successfully' });
        } else {
          res.status(400).json({ message: 'Failed to log in user' });
        }
      }
    } else {
      res.status(400).json({ message: 'No active event found' });
    }
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

app.get('/api/event/current', async (req, res) => {
  try {
    const [rows, fields] = await connection.promise().query('SELECT * FROM event WHERE active = 1');
    if (rows.length > 0) {
      res.status(200).json(rows[0]);
    } else {
      res.status(404).json({ message: 'No active event found' });
    }
  } catch (error) {
    console.error('Error fetching current event:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Route to end the current event
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
      user: 'dropmentset@gmail.com',
      pass: 'pgpq ydgd qztt mcex',
  },
});

app.post('/api/event/end', async (req, res) => {
  try {
      // Update event status to inactive
      await connection.promise().query('UPDATE event SET active = 0 WHERE active = 1');

      // Send email to all users
      await sendEmailToUsers();

      res.status(200).json({ message: 'Event ended successfully' });
  } catch (error) {
      console.error('Error ending event:', error);
      res.status(500).json({ message: 'Internal server error' });
  }
});

const sendEmailToUsers = async () => {
  try {
      // Fetch all user emails from the database
      const [rows] = await connection.promise().query('SELECT user_email FROM users');

      // Prepare email options
      const mailOptions = {
          from: 'dropmentset@gmail.com',
          subject: 'Event Ended',
          html: '<p>The event has ended.</p>',
      };

      // Send email to each user
      for (const row of rows) {
          mailOptions.to = row.user_email;
          await transporter.sendMail(mailOptions);
          console.log(`Email sent to ${row.user_email}`);
      }
  } catch (error) {
      console.error('Error sending email to users:', error);
  }
};

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});