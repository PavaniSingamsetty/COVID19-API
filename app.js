const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jsonwebtoken = require("jsonwebtoken");

const app = express();
let db = null;

app.use(express.json());

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const initializeDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Database error: ${error.message}`);
    process.exit(1);
  }
};

initializeDBandServer();

//Login User API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(getUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password);
    if (isPasswordCorrect) {
      response.status(200);
      const payload = { username: username };
      const jwtToken = await jsonwebtoken.sign(payload, "secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authenticate User
const authenticateUser = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const isValidToken = await jsonwebtoken.verify(
      jwtToken,
      "secret",
      (error, payload) => {
        if (error) {
          response.status(401);
          response.send("Invalid JWT Token");
        } else {
          request.username = payload.username;
          next();
        }
      }
    );
  }
};

const convertDistrictDetails = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//Get States API
app.get("/states/", authenticateUser, async (request, response) => {
  const getStatesQuery = `
        SELECT state_id as stateId, state_name as stateName, population
        FROM state
        ORDER BY state_id;
    `;

  const statesArray = await db.all(getStatesQuery);
  response.send(statesArray);
});

//Get State API
app.get("/states/:stateId/", authenticateUser, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `
        SELECT state_id as stateId, state_name as stateName, population 
        FROM state
        WHERE state_id = ${stateId};
    `;
  const stateArray = await db.get(getStateQuery);
  response.send(stateArray);
});

//Post District Details
app.post("/districts/", authenticateUser, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;
  const postDistrictQuery = `
        INSERT INTO district
        (district_name, state_id, cases, cured, active, deaths)
        VALUES 
        ( '${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths} );
    `;

  await db.run(postDistrictQuery);
  response.send("District Successfully Added");
});

//Get District API
app.get(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `
        SELECT * 
        FROM district
        WHERE district_id = ${districtId};
    `;
    const districtArray = await db.get(getDistrictQuery);
    response.send(convertDistrictDetails(districtArray));
  }
);

//Delete District API
app.delete(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
        DELETE FROM district
        WHERE district_id = ${districtId};
    `;

    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

//Update District API
app.put(
  "/districts/:districtId/",
  authenticateUser,
  async (request, response) => {
    const districtDetails = request.body;
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;
    const postDistrictQuery = `
        UPDATE district
        SET 
        district_name = '${districtName}', 
        state_id = ${stateId}, 
        cases = ${cases}, 
        cured = ${cured}, 
        active = ${active}, 
        deaths = ${deaths};
        WHERE district_id = ${districtId};
    `;

    await db.run(postDistrictQuery);
    response.send("District Details Updated");
  }
);

//Get Statewise Stats API
app.get(
  "/states/:stateId/stats",
  authenticateUser,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
        SELECT SUM(district.cases) as totalCases,
            SUM(district.cured) as totalCured,
            SUM(district.active) as totalActive,
            SUM(district.deaths) as totalDeaths
        FROM state INNER JOIN district 
            ON state.state_id = district.state_id
        GROUP BY district.state_id
        HAVING district.state_id = ${stateId};
    `;
    const stateStatsArray = await db.get(getStateStatsQuery);
    response.send(stateStatsArray);
  }
);

//Get State Name API
app.get(
  "/districts/:districtId/details/",
  authenticateUser,
  async (request, response) => {
    const { districtId } = request.params;
    const getStateNameQuery = `
        SELECT state.state_name as stateName
        FROM state INNER JOIN district 
            ON state.state_id = district.state_id
        WHERE district.district_id = ${districtId};
    `;
    const stateName = await db.get(getStateNameQuery);
    response.send(stateName);
  }
);

module.exports = app;
