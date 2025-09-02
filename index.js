// import { config } from "dotenv";
import jwt from "jsonwebtoken";
import express from "express";
import bcrypt from "bcrypt";
import mysql from "mysql2";
import cors from "cors";

// const ip = "localhost";
const port = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());
// config();

const dbPool = mysql.createPool({
  host: process.env.db_host,
  user: process.env.db_user,
  port:  process.env.db_port,
  password: process.env.db_pass,
  database: process.env.db_db, 
  ssl: {
    rejectUnauthorized: false, // Aiven requires SSL
  },
});

app.get("/", (req, res) => {
  const query = req.query.query;
  const searchQuery = (query && query.toString().trim().slice(1)) || "RUET";
  // console.log("input text:", searchQuery, query);

  const keywords = searchQuery.split(",").map((keyword) => keyword.trim());
  const keywordList = keywords.map((keyword) => `'${keyword}'`).join(",");
  const keywordList2 = keywords
    .map((keyword) => `'%${keyword}%'`)
    .join(" or keywords.attribute like ");
  // console.log(keywordList2, keywords);

  const sql = `
  select  a.*, 
  CONCAT_WS(', ', a.roll, higherEd, state, country, attributes) AS keywords 
  from alumni a
  join keywords on keywords.roll=a.roll 
  where keywords.attribute in (${keywordList})
  GROUP BY a.roll
  HAVING COUNT(DISTINCT keywords.attribute) = ${keywords.length};`;

  const sql2 = `
  select  a.*, 
  CONCAT_WS(', ', a.roll, higherEd, state, country, attributes) AS keywords 
  from alumni a
  join keywords on keywords.roll=a.roll 
  where keywords.attribute like ${keywordList2}
  GROUP BY a.roll
  HAVING COUNT(DISTINCT keywords.attribute) = ${keywords.length};`;

  dbPool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to MySQL:", err);
      res.sendStatus(500);
    } else {
      let qry = query[0] === "1" ? sql : sql2;
      // console.log('\n---  ', qry, "  ---");
      connection.query(qry, (error, results) => {
        connection.release();
        if (error) {
          console.error("Database query error:", error);
          res.sendStatus(500);
        } else {
          res.json(results);
        }
      });
    }
  });
});

app.post("/", async (req, res) => {
  // "async" keyword added for line 227/new query module";

  const person = req.body;
  // console.log(person);
  const personArr = [
    person.roll,
    person.name,
    person.thumbnail,
    person.image,
    person.position,
    person.company,
    person.higherEd,
    person.city,
    person.state,
    person.country,
    person.contacts,
    person.about,
    person.attributes,
    person.password,
  ];

  const sql = `
    INSERT INTO cse3100.alumni (roll, name, thumbnail, image, position, higherEd, company, city, state, country, contacts, about, attributes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) as pdata
    ON DUPLICATE KEY UPDATE
      name = pdata.name,
      thumbnail = pdata.thumbnail,
      image = pdata.image,
      position = pdata.position,
      company = pdata.company,
      higherEd = pdata.higherEd,
      city = pdata.city,
      state = pdata.state,
      country = pdata.country,
      contacts = pdata.contacts,
      about = pdata.about,
      attributes=pdata.attributes;
    `; //doesn't have password verification embedded in it.

  const sql2 = `INSERT INTO alumni (roll, name, thumbnail, image, position, company, higherEd, city, state, country, contacts, about, attributes)
  SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  FROM DUAL
  WHERE EXISTS (
    SELECT 1
    FROM users
    WHERE users.roll = roll AND users.password = ?
  )
  ON DUPLICATE KEY UPDATE
    name = VALUES(name),
    thumbnail = VALUES(thumbnail),
    image = VALUES(image),
    position = VALUES(position),
    company = VALUES(company),
    higherEd = VALUES(higherEd),
    city = VALUES(city),
    state = VALUES(state),
    country = VALUES(country),
    contacts = VALUES(contacts),
    about = VALUES(about),
    attributes = VALUES(attributes);
  `;

  let str = `${person.name},${person.roll},${person.position},${person.company},${person.higherEd},${person.city},${person.state},${person.country},${person.attributes}`;

  let strArr = str
    .split(",") // Split by comma
    .map((item) => item.trim()) // Trim leading and trailing spaces
    .filter((item) => item !== ""); // Remove empty elements

  // Prepare sql3 query for deletion and insertion into keywords
  let sql3 = `DELETE FROM keywords WHERE roll = ? AND EXISTS ( SELECT 1 FROM users WHERE users.roll = keywords.roll AND users.password = ? );`;
  let sql4 = `INSERT INTO \`keywords\` (\`roll\`, \`attribute\`) VALUES `;

  let sqlValues = [];
  strArr.forEach((item, index) => {
    if (index === 0) {
      sql4 += "(?, ?)";
    } else {
      sql4 += ", (?, ?)";
    }
    sqlValues.push(person.roll, item);
  });
  sql4 += ";"; // " AND EXISTS ( SELECT 1 FROM users WHERE users.roll = keywords.roll AND users.password = ?);";
  // sqlValues.push(person.password);

  // dbPool.getConnection((err, connection) => {
  //   if (err) {
  //     console.error("Error connecting to MySQL:", err);
  //     res.sendStatus(500);
  //     return;
  //   }

  //   else {
  //     connection.query(sql2, personArr, (error, results) => {
  //       if (error) {
  //         connection.release();
  //         console.error("Database query error:", error);
  //         res.sendStatus(500);
  //         return;
  //       } else {
  //         connection.query(
  //           sql3,
  //           [person.roll, person.password],
  //           (error, results) => {
  //             connection.release();
  //             if (error) {
  //               console.error("Database query error:", error);
  //               res.sendStatus(500);
  //               return;
  //             } else {
  //               connection.query(sql4, sqlValues, (error, results) => {
  //                 connection.release();
  //                 if (error) {
  //                   console.error("Database query error:", error);
  //                   res.sendStatus(500);
  //                   return;
  //                 } else {
  //                   res.json(results);
  //                 }
  //               });
  //             }
  //           }
  //         );
  //       }
  //     });
  //   }
  // });

  //---> async-await version of the above code <---//
  const getConnection = (pool) => {
    return new Promise((resolve, reject) => {
      pool.getConnection((err, connection) => {
        if (err) {
          reject(err);
        } else {
          resolve(connection);
        }
      });
    });
  };

  const query = (connection, sql, params) => {
    return new Promise((resolve, reject) => {
      connection.query(sql, params, (error, results) => {
        if (error) {
          reject(error);
        } else {
          resolve(results);
        }
      });
    });
  };

  // app.post("/your-endpoint", async (req, res) => {
  let connection;

  try {
    connection = await getConnection(dbPool);

    // Execute first query
    await query(connection, sql2, personArr);

    // Execute second query
    await query(connection, sql3, [person.roll, person.password]);

    // Execute third query
    const results = await query(connection, sql4, sqlValues);

    // Send response
    res.json(results);
  } catch (err) {
    console.error("Database error:", err);
    res.sendStatus(500);
  } finally {
    if (connection) connection.release();
  }
  // });
  //---> async-await version of the above code ends here <---//
});

app.post("/cngpass", (req, res) => {

  // let query = `UPDATE users SET password=? WHERE roll=?;`;
  // let params = [
  //   req.body.newPass,
  //   req.body.roll,
  // ];
  let query = `UPDATE users u JOIN ( SELECT roll FROM users WHERE roll = ? AND password = ? ) subquery ON u.roll = subquery.roll SET u.password = ?;`;

  let params = [
    req.body.roll,
    req.body.password,
    req.body.newPass,
  ];
  // Hash new password
  // let saltRounds = 2;
  // const hashPassword = async (plainTextPassword) => {
  //   try {
  //     const salt = await bcrypt.genSalt(saltRounds);
  //     const hash = await bcrypt.hash(plainTextPassword, salt);
  //     console.log("Hashed password:", hash);
  //     return hash;
  //   } catch (err) {
  //     console.error("Error hashing password:", err);
  //   }
  // };
  // params[2] = hashPassword(params[2]);

  dbPool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to MySQL:", err);
      res.sendStatus(500);
    } else {
      connection.query(query, params, (error, results) => {
        connection.release();
        if (error) {
          console.error("Database query error:", error);
          res.sendStatus(500);
          return;
        } else {
          console.log(`password change request sent by ${req.body.roll}`);
          console.log(params);
          res.json(results);
        }
      });
    }
  });
});

app.post("/login", (req, res) => {
  const { roll, password } = req.body;
  dbPool.getConnection((err, connection) => {
    if (err) {
      console.error("Error connecting to MySQL:", err);
      res.sendStatus(500);
    } else {
      const query = "SELECT * FROM users WHERE roll = ?";
      connection.query(query, [roll], (error, results) => {
        connection.release();
        if (error) {
          console.error("Database query error:", error);
          res.sendStatus(500);
        } else {
          if (results.length > 0) {
            const user = results[0];

            const providedPasswordUtf8 = Buffer.from(
              password.trim(),
              "utf-8"
            ).toString("utf-8");
            const storedPasswordUtf8 = Buffer.from(
              user.password.trim(),
              "utf-8"
            ).toString("utf-8");

            // Compare the passwords

            // stored password is in hashed form
            // bcrypt.compare(
            //   providedPasswordUtf8,
            //   storedPasswordUtf8,
            //   (bcryptError, bcryptResult) => {
            //     if (bcryptError) {
            //       console.error("Bcrypt error:", bcryptError);
            //       res.sendStatus(500);
            //     } else if (bcryptResult) {
            //       console.log("Password matched!");
            //       // If passwords match, generate a JWT and send it as a response
            //       const token = jwt.sign(
            //         { userId: user.roll },
            //         "your_secret_key",
            //         {
            //           expiresIn: "1h",
            //         }
            //       );
            //       res.json({ token });
            //     } else {
            //       console.log(
            //         "Passwords don't match:",
            //         password,
            //         user.password
            //       );
            //       // Passwords don't match
            //       res.status(401).json({ message: "Authentication failed" });
            //     }
            //   }
            // );

            // stored password is non hashed password
            if (providedPasswordUtf8 === storedPasswordUtf8) {
              console.log("Password matched!");
              // If passwords match, generate a JWT and send it as a response
              const token = jwt.sign({ userId: user.roll }, "your_secret_key", {
                expiresIn: "1h",
              });
              res.json({ token });
            } else {
              console.log("Passwords don't match:", password, user.password);
              // Passwords don't match
              res.status(401).json({ message: "Authentication failed" });
            }
          } else {
            console.log("user not found !");
            // User not found
            res.status(401).json({ message: "Authentication failed" });
          }
        }
      });
    }
  });
});

app.post("/kahoot", (req, res) => {
  console.log("kahoot called");
  let sql = `SELECT attribute, COUNT(*) AS attCount
  FROM keywords
  GROUP BY attribute
  ORDER BY attCount DESC
  LIMIT 7;`;
  dbPool.getConnection((err, connection) => {
    if (err) {
      console.log("Error connecting to MySQL:", err);
      res.sendStatus(500);
    } else {
      connection.query(sql, (error, results) => {
        connection.release();
        if (error) {
          console.error("Database query error:", error);
          res.sendStatus(500);
        } else {
          res.json(results);
        }
      });
    }
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}, ain't it?`);
});


