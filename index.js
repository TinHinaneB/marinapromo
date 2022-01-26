const express = require("express");
const mysql = require("mysql");
const flash = require("connect-flash");
const dotenv = require("dotenv");
const ejs = require("ejs");
const passport = require("passport");
const Strategy = require("passport-local").Strategy;
const session = require("express-session");
const GoogleStrategy = require("passport-google-oauth").OAuth2Strategy;
const crypto = require("crypto");
const ap = require("./array");

dotenv.config({
  path: "./.env",
});
//* db creation with credentials
const db = mysql.createPool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});
//* db connection established
/*db.connect((err) => {
  if (err) {
    console.log(err);
  } else {
    console.log("mysql Server connected ! ");
  }
});*/
function sha512(data) {
  return crypto.createHash("sha512").update(data, "utf-8").digest("hex");
}
passport.use(
  "local-signup",
  new Strategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true, // allows us to pass back the entire request to the callback
    },
    function (req, username, password, done) {
      // Find a user whose username is the same as the forms username
      // Check to see if the user trying to login already exists
      const { name, passwordConfirmed } = req.body;
      const email = username;

      db.query("SELECT email FROM users WHERE email = ?", [email], function (err, rows) {
        if (err) return done(err);
        if (password !== passwordConfirmed) {
          return done(null, false, req.flash("signupMessage", "Passwords don't match."));
        }
        if (rows.length) {
          //* stops and returns
          return done(null, false, req.flash("signupMessage", "That email already exists."));
        } else {
          // Create the user if there is no user with that username
          password = sha512(password);
          var newUserMysql = new Object();

          newUserMysql.username = name;
          newUserMysql.email = email;
          newUserMysql.password = password; // use the generateHash function in our user model

          db.query("INSERT INTO users SET ?", { name: name, email: email, password: password }, (err, rows) => {
            newUserMysql.id = rows.insertId;
            return done(null, newUserMysql);
          });
        }
      });
    }
  )
);

passport.use(
  "local-login",
  new Strategy(
    {
      usernameField: "email_1",
      passwordField: "password_1",
      passReqToCallback: true,
    },
    function (req, username, password, done) {
      const email = username;

      db.query("SELECT * FROM users WHERE email = ?", [email], function (err, rows) {
        if (err) {
          return done(err);
        }
        if (!rows.length) {
          return done(null, false, req.flash("loginMessage", "No user found."));
        }
        password = sha512(password);
        if (!(rows[0].password == password)) {
          return done(null, false, req.flash("loginMessage", "Wrong password."));
        } else {
          return done(null, rows[0]);
        }
      });
    }
  )
);

// Passport session
// Required for persistent login sessions
// Serialize the user for the session
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

// Deserialize the user
passport.deserializeUser(function (req, user, done) {
  db.query("SELECT * from users WHERE id = ? ", [user.id], function (err, rows) {
    if (err) {
      console.log(err);
      return done(null, err);
    }
    done(null, user);
  });
});

//! Oauth 2.0
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.CLIENT_ID,
      clientSecret: process.env.CLIENT_SECRET,
      callbackURL: "http://localhost:5000/logements",
      //! added from github about the problem about google+ API
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    function (accessToken, refreshToken, profile, cb) {
      db.query("SELECT * FROM googlusers WHERE google_id = ?", [profile.id], (err, user) => {
        if (err) {
          return done(err);
        } else if (user) {
          return done(null, user);
        } else {
          let newUser = {
            google_id: profile.id,
            google_token: accessToken,
            google_email: profile.emails[0].value,
            google_name: profle.name.givenName + " " + profile.name.familyName,
          };

          db.query(
            "INSERT INTO googleusers (google_id, google_token, google_email, google_name) VALUES (?, ?, ?, ?)",
            [newUser.google_id, newUser.google_token, newUser.google_email, newUser.google_name],
            (err, rows) => {
              if (err) {
                console.log(err);
              }

              return done(null, newUser);
            }
          );
        }
      });
    }
  )
);
let value = {};
const app = express();
const PORT = process.env.PORT || 3000;
//! changing engine to ejs
app.set("view engine", "ejs");

app.use(express.static("public"));
//* parse any submission (to json) from the form in our html
app.use(express.urlencoded({ extended: false }));
app.use(session({ secret: process.env.SECRET, resave: false, saveUninitialized: false }));

// Initialize Passport and restore authentication state, if any, from the session
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//* GEt req for each port

app.get("/", (req, res) => {
  res.render("home");
});
app.get("/NosProjets", (req, res) => {
  res.render("NosProjets");
});
app.get("/NosProjetsLivres", (req, res) => {
  res.render("NosProjetsLivres");
});

app.get("/found", (req, res) => {
  res.render("found");
});
app.get("/notmatched", (req, res) => {
  res.render("notmatched");
});
app.get("/forbidden", (req, res) => {
  res.render("forbidden");
});

app.get("/success", (req, res) => {
  res.render("success");
});
// //* not my files
app.get("/logements", (req, res) => {
  if (req.user) {
    res.render("logements", { user: req.user });
  } else {
    res.render("forbidden");
  }
});

app.post("/logements", (req, res) => {
  let apartment = {
    block: req.body.Bloc,
    floor: req.body.Etage,
  };
  //! resets the object each time
  value = apartment;
  res.redirect("temp");
});

app.get("/FAQ", (req, res) => {
  res.render("FAQ");
});
app.get("/temp", (req, res) => {
  let blockUser = value.block;
  let floorUser = value.floor;
  let apartement = blockUser + floorUser;
  let getInfo = ap.filter((entry) => {
    return entry.apartement == apartement;
  });

  let infoArray = getInfo[0].info;
  console.log(infoArray);

  res.render("temp", {
    block: blockUser,
    floor: floorUser,
    infoArray: infoArray,
  });
});
app.post("/temp", (req, res) => {
  res.redirect("/info");
});
//* this gets logged in our database along with all the info there
app.get("/info", (req, res) => {
  res.render("clientInfo");
});
app.post("/info", (req, res) => {
  let { nom, prenom, email, password, address, gender, apartement, telephone, date, meet } = req.body;
  passwordHashed = sha512(password);
  db.query(
    "INSERT INTO clientinfo SET ?",
    {
      nom: nom,
      prenom: prenom,
      email: email,
      password: passwordHashed,
      address: address,
      gender: gender,
      apartement: apartement,
      telephone: telephone,
      date: date,
      meet: meet,
    },
    (err, rows) => {
      if (err) return console.log(err);
    }
  );

  res.redirect("success");
});

// //* GEt req for each port

// //? AUTHENTICATION

app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
app.get("/auth/google/logements", passport.authenticate("google", { failureRedirect: "/login" }), function (req, res) {
  // Successful authentication, redirect home.
  res.redirect("/logements");
});

app
  .route("/register")
  .get((req, res) => {
    res.render("login");
  })
  .post(passport.authenticate("local-signup", { failureRedirect: "/register", failureFlash: true }), function (req, res) {
    res.redirect("/logements");
  });

app
  .route("/login")
  .get((req, res) => {
    res.render("login");
  })
  .post(passport.authenticate("local-login", { failureRedirect: "/login", failureFlash: "Invalid username or password." }), function (req, res) {
    res.redirect("/logements");
  });

//* sending Login info to the server, and checking it with the database

// //? AUTHENTICATION

//? Server Creation
app.listen(PORT, () => {
  console.log("Server started at " + PORT + " Get to work ! ");
});
