//imports and require statements.
const express = require('express');
const request = require('request');
const bodyParser = require('body-parser');
const connection = require('./database');
const crypto = require('crypto');
const session = require('express-session');
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-node');
const encoder = require('@tensorflow-models/universal-sentence-encoder');
const similarity = require('compute-cosine-similarity');
const path = require('path');
require('dotenv').config();


/*THESE ARE ALL THE FUNCTIONS USED INSIDE THE SERVER SIDE CODE */
//generating salt for password hashing
var genSalt = function(length){
	return crypto.randomBytes(Math.ceil(length/2)).toString('hex').slice(0,length);
};

//generate normal hash
var normalHash = function(userPassword){
	const normalHash = crypto.createHash('sha512').update(userPassword).digest('hex');
	return normalHash;
};

//generate salted hash
var sha512 = function(password,salt){
	var hash = crypto.createHmac('sha512',salt);
	hash.update(password);
	var value = hash.digest('hex');
	return{
		salt:salt,
		passwordHash:value
	};
};

//a function that uses similarity function above to generate similarity dictionary
var get_cosine_similarity_matrix = function(user_matrix,all_matrix){
	//key = user_matrix_sentence_index, value = list(cosine_similarity_score) with all_matrix
	var return_dict = {};

	for (i=0;i<user_matrix.length;i++){
		var local_user_matrix = [];
		for (j=0;j<all_matrix.length;j++){
			var s = similarity(user_matrix[i],all_matrix[j]);
			local_user_matrix.push(s);
		}
		return_dict[i] = local_user_matrix;
	}
	return return_dict;
};

//getting embeddings for a list of sentences
var get_embeddings = async function(list_sentences){
	const model = await encoder.load();
	const embeddings = await model.embed(list_sentences);
	const a = embeddings.arraySync();
	return a;
};


/*ALL THE SERVER SIDE CODE AND ENDPOINTS BEGIN HERE*/

//initiating server and app
const app = express();
const port = 3000;

//trying to implement sessions
app.use(session({
   secret: process.env.SESSION_SECRET,
   resave: true,
   saveUninitialized: true,
   loggedin: false,
   user_email: null,
   first_name: null,
   last_name: null
}));
//

app.use('/login',express.static('public'));

//allow sending and receiving different objects
app.use(bodyParser.urlencoded({
	extended:true
}));
app.use(bodyParser.json());

//allow cross domain communication
var allowCrossDomain = function(req,res,next){
	res.header('Access-Control-Allow-Origin','*');
	res.header('Access-Control-Allow-Methods','GET,PUT,POST,DELETE');
	res.header('Access-Control-Allow-Headers','Content-Type');

	next();
};
app.use(allowCrossDomain);

//default pathname redirects to login page
app.get('/',function(req,resp){
	console.log(req.session);
	//redirect to main page if logged in
	if (req.session.loggedin){
		resp.redirect('/main');
	}
	//redirect to login page if not
	else{
		resp.redirect('/login');
	}
});

//db test endpoint for seeing the data in the db. WILL BE REMOVED AFTER DEV IS COMPLETE
app.route('/test_db').get(function(req,res,next){
	connection.query(
		"SELECT * from `users`",
		function(error,results,fields){
			if (error) throw error;
			res.json(results);
		}
	);
});

//db test endpoint for seeing the data in the current db
app.route('/test_db2').get(function(req,res,next){
	connection.query(
		"SELECT * from `current`",
		function(error,results,fields){
			if (error) throw error;
			res.json(results);
		}
	);
});

//db test endpoint for seeing the data in history db
app.route('/test_db3').get(function(req,res,next){
	connection.query(
		"SELECT * from `history`",
		function(error,results,fields){
			if (error) throw error;
			res.json(results);
		}
	);
});


//db get user endpoint for login verification
app.get('/check_user',function(req,res,next){
	const user_email = req.query.email;
	const my_pass = req.query.password;
	const pass = normalHash(my_pass);


	//make sql query
	connection.query("SELECT first_name,last_name,email from `users` WHERE email='"+user_email+"' AND password_hash='"+pass+"'",function (error,results,fields) {
		//some internal sql error only
		if (error) throw error;

		else{
			console.log("reached");
			//user found
			if (results[0]){
				//continue here and bring in authentication and redirect logic here
				//remove the redirect and stuff from index.js. Only keep the logic for displaying errors. Otherwise, console.log everything.
				req.session.loggedin = true;
				req.session.user_email = user_email;
				req.session.first_name = results[0].first_name;
				req.session.last_name = results[0].last_name;
				res.send(results);
			}
			//user not found
			else{
				//error display logic to be handled at client
				console.log("user not found.");
				res.send(results);
			}
		}
	}
	);
});

// endpoint that gets first and last name of user
app.get("/get_user_info", function(req, res) {
	if (req.session.loggedin) {
		// Get values from the session data
		user_email = req.session.user_email;

		/* alternate way Vivek - res.send(req.session) */

		// get user info from database
		connection.query("SELECT first_name,last_name,email from `users` WHERE email='" + user_email + "'", function (error, results, fields) {
			//some internal sql error only
			if (error) throw error;

			else {
				console.log("reached");
				//user found
				if (results[0]) {
					//send info to client
					res.type("application/json");
					res.send(results);
				}
				//user not found
				else {
					//error display logic to be handled at client
					console.log("user not found.");
					res.send(results);
				}
			}
		});
	}
	else{
		res.send("You need to login to access this endpoint.")
	}
});

app.get("/get_task",function(req, res, next){
	if (req.session.loggedin) {
		const user_email = req.session.user_email;

		// get user info from database
		connection.query("SELECT task, due_date, priority from `current` WHERE email='" + user_email + "' ORDER BY due_date,priority", function (error, results, fields) {
			//some internal sql error only
			if (error) throw error;

			else {
				console.log("reached");
				//user found
				if (results[0]) {
					//send info to client
					res.type("application/json");
					res.send(results);
				}
				//user not found
				else {
					//error display logic to be handled at client
					console.log("user not found.");
					res.send(results);
				}
			}
		});
	}
	else{
		res.send("You need to login to access this endpoint")
	}
});

/*
//temp
app.get("/temp",function(req,res,next){
	connection.query(
		//"SHOW CREATE TABLE `history`",
		//"ALTER TABLE `history` DROP PRIMARY KEY",
			"TRUNCATE TABLE `current`",
		function(error,results,field){
			if (error) throw error;
			else{
				res.json(results);
				console.log("DROPPED");
			}
		}
	);
});
*/


//an endpoint that renders cutomized homepage for the logged in user. REMEMBER, all the users will not have a common homepage.
app.get('/main',function(req,res,next){
	if (req.session.loggedin){
		//res.send("<h1>Hello "+req.session.first_name+" "+req.session.last_name+"!</h1>");
		res.sendFile(path.join(__dirname,'public','main.html'));
	}
	else{
		//res.send("You need to login to access tyhis page.");
		res.redirect('/');
	}
});

//signout endpoint - have a signout button in the client and bind this endpoint with it.
//PENDING BINDING ON CLIENT SIDE.
app.get('/signout',function(req,res,next){
	req.session.loggedin = false;
	req.session.user_email = null;
	req.session.first_name = null;
	req.session.last_name = null;
	res.redirect("/");
});

//an endpoint that will edit the task in the database
app.post("/edit_task",function(req,res,next){
	if (req.session.loggedin){
	const data = req;
	const user_email = req.session.user_email;
	const old_task = data.body.oldTask;
	const old_due_date = data.body.oldDueDate;
	const old_priority = data.body.oldPriority;
	const new_task = data.body.newtask;
	const new_due_date = data.body.newDueDate;
	const new_priority = data.body.newPriority;

	connection.query(
		"UPDATE`current` SET task='"+new_task+"',priority='"+new_priority+"',due_date='"+new_due_date+"' WHERE email='"+user_email+"' AND task='"+old_task+"'",
		function(error,results,fields){
			if (error) throw error;
			else{
					connection.query(
						"SELECT * FROM `history` WHERE email='"+user_email+"' AND task='"+new_task+"'",
						function(error,results,fields){
							if (error) throw error;
							else{
								console.log(results);
								if (results[0]){
									connection.query(
										"UPDATE `history` SET counter = counter + 1 WHERE email='"+user_email+"' AND task='"+new_task+"'",
										function (error,results,fields) {
											if (error) throw error;
											else{
												console.log("task found in history.counter increased.");
												res.status(200).send("Task edited.");
											}
										}
									);
								}
								else {
									connection.query(
										"INSERT INTO `history` (email,task,counter) VALUES('"+user_email+"','"+new_task+"',1)",
										function (error,results,fields) {
											if (error) throw error;
											else{
												console.log("task not found in history.now added.");
												res.status(200).send("Task edited.");
											}
										}
									);
								}
							}
						}
					);
			}
		}
	);
}
});

//db post endpoint for deleting your account. create a button on user homepage and bind this endpoint with it.
app.post('/remove_db',function(req,res,next){
	const data = req;
	const user_email = data.body.email;

	if (user_email != req.session.user_email) {
		throw error;
	}

	req.session.loggedin = false;
	req.session.user_email = null;
	req.session.first_name = null;
	req.session.last_name = null;

	//INSERT A DELETE QUERY HERE
	connection.query(
		"DELETE from `users` WHERE email='"+user_email+"'",
			function(error,results,fields){
			   if (error){
				  throw error;
			   }
			   else{
				  console.log("user deleted");
				  connection.query(
					"DELETE from `current` WHERE email='"+user_email+"'",
						function(error,results,fields){
							if (error){
								throw error;
							}
							else{
								console.log("current tasks deleted")
							}
						}
				  )
				  res.redirect("/");
			   }
			});
});


//db post endpoint for creating new user for create account
app.post('/post_db',function (req,res,next) {
	const data = req;
	const first_name = data.body.first_name;
	const last_name = data.body.last_name;
	const email = data.body.email;
	const password = data.body.password;
	const password_hash = normalHash(password); //512 hashed
	const uid_password = sha512(password,genSalt(16)).passwordHash; //salted unique hash
	connection.query(
		"INSERT into `users` VALUES('"+first_name+"','"+last_name+"','"+email+"','"+password_hash+"','"+uid_password+"')",//finish the query
		function(error,results,fields){
			if (error){
				res.status(400).send("user exists.");
			}
			else{
				res.status(200).send("user added.");
			}
		}
	);
});


//gets the history which will be used for recommending most frequently added task to users
app.get('/get_history',function(req,res,next){
	if (req.session.loggedin) {
		const email = req.session.user_email;
		connection.query(
			"SELECT * FROM `history` WHERE email='"+email+"'ORDER BY counter DESC LIMIT 10",
			function (error, results, fields) {
				if (error) throw error;
				else {
					res.json(results);
				}
			}
		);
	}
	else{
		res.send("You need to log in to access this endpoint")
	}
});


//delete task post endpoint
//NOTE: This enpoint will be bound to a button in client code and will expect a TASK exactly as stored in db
app.post('/delete_task',function(req,res,next){
	if (req.session.loggedin){
		const data = req;
		const email = req.session.user_email;
		const task = data.body.task;
		connection.query(
			"DELETE FROM `current` WHERE email='"+email+"'AND task='"+task+"'",
			function(error,results,fields){
				if (error) throw error;
				else{
					res.status(200).send("task deleted from current table");
				}
			}
		);
	}
});

//an endpoint for getting recommendations using machine learning
app.get('/get_custom_recommendations',function(req,res,next){
	//get all the tasks FOR ALL USERS from history table using history database
	//get all the tasks FOR CURRENTLY LOGGED IN user using history database
	//vectorize using a common algorithm (TF,IDF,HF)
	//recommend the top one using cosine similarity
	//add a priority weightage while making recommendations
	if (req.session.loggedin){
		const email = req.session.user_email;
		const all_tasks = [];
		const user_tasks = [];
		//get all historic tasks
		connection.query(
			"SELECT * FROM `history` WHERE email!='"+email+"'",
			function(error,results,fields){
				if (error) throw error;
				else{
					//get tasks for current user
					connection.query(
						"SELECT * FROM `history` WHERE email='"+email+"'",
						function(err,my_results,fiel){
							if (err) throw err;
							else{
								for (i=0;i<results.length;i++){
									all_tasks.push(results[i].task.toLowerCase());
								}
								for (i=0;i<my_results.length;i++){
									user_tasks.push(my_results[i].task.toLowerCase());
								}
								console.log(all_tasks);
								console.log(user_tasks);

								const b = get_embeddings(all_tasks);

								b.then(function(result){
									const a = get_embeddings(user_tasks);
									a.then(function(done){
										const my_results = get_cosine_similarity_matrix(done,result);
										//get the best results and send it
										var return_list = [];
										for (var key in my_results){
											//key = index of user tasks; value = array of all tasks
											for (k=0;k<my_results[key].length;k++) {
												var return_object = {};
												return_object["user_task"] = user_tasks[key];
												return_object["recommended_task"] = all_tasks[k];
												var sim = my_results[key][k];
												sim = sim.toFixed(2);
												sim = parseFloat(sim);
												const percent = sim * 100;
												return_object["similarity"] = percent;
												return_list.push(return_object);
											}
										}
										console.log(JSON.stringify(return_list,null,4));
										res.json(return_list);
									});
								});
							}
						}
					);
				}
			}
		);
	}
	else{
		res.send("You must log in to access this endpoint.")
	}


});


//adds a new task in the database as a post request
app.post('/add_task',function (req,res,next) {
	const data = req;
	const email = req.session.user_email;
	const task = data.body.task;
	const dueDate = data.body.dueDate;
	const priority = data.body.priority;
	connection.query(
		"INSERT into `current` (email, task, due_date, priority) VALUES('"+email+"','"+task+"','"+dueDate+"','"+priority+"')", //finish the query
		function(error,results,fields){
			if (error){
				throw error;
			}
			else{
				//add history
				connection.query(
					"SELECT * FROM `history` WHERE email='"+email+"' AND task='"+task+"'",
					function(error,results,fields){
						if(error) throw error;
						else{
							console.log(results);
							if (results[0]){
								//increase count by 1 as the task already exists for the users
								connection.query(
									"UPDATE `history` SET counter = counter + 1 WHERE email='"+email+"' AND task='"+task+"'",
									function (error,results,fields) {
										if (error) throw error;
										else{
											console.log("task found in history.counter increased.");
											res.status(200).send("Task added.");
										}
									}
								);
							}
							else {
								connection.query(
									"INSERT INTO `history` (email,task,counter) VALUES('"+email+"','"+task+"',1)",
									function (error,results,fields) {
										if (error) throw error;
										else{
											console.log("task not found in history.now added.");
											res.status(200).send("Task added.");
										}
									}
								);
							}
						}
					}
				);
			}
		}
	);
});

//listen
app.listen(port, () => console.log('Listening on port '+port));
