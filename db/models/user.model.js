const mongoose = require('mongoose');
const _ = require('loadash');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { resolve } = require('path');
const { rejects } = require('assert');

//JWT secret
const jwtSecret = "dK1ssE4zDbhQiQX50h262bKfWT2wTzvlCvezh5AfxZqlYw3LNQ";

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        minLength: 1,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minLength: 8
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
})

/*Instance Methods*/
UserSchema.methods.toJSON = function () {
    const user = this;
    const userObject = user.toObject();

    //return the document except the password and sessions (these shouldn't be made available)
    return _.omit(userObject, ['password', 'sessions']);

}

UserSchema.methods.generateAccessAuthToken = function () {
    const user = this;
    return new Promise((resolve, reject) => {
        //create the JSON Web Token(JWT) and return that
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "15m" }, (err, token) => {
            if (!err) {
                resolve(token);
            } else {
                //there is an error
                reject();
            }
        })
    })
}

UserSchema.methods.generateRefreshAuthToken = function () {
    //This method simply generates a 64 byte hex string. it doesn't save it to the database. saveSessionToDatabase() does that.
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buf) => {
            if (!err) {
                let token = buf.toString('hex');
                return resolve(token);
            }
        })
    })
}

UserSchema.methods.createSession = function () {
    let user = this;

    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDatabase(user, refreshToken);
    }).then((refreshToken) => {
        //saved to database successfully, now return the refreshTokem
        return refreshToken;
    }).catch((e) => {
        return Promise.reject("Failed to save session to db.\n" + e)
    })
}


/**MODEL Methods (static methods) **/
UserSchema.statics.findByIdAndToken = function (_id, token) {
    //find user by id and token
    //used in auth middleware (verifySession)
    const User = this;
    return User.findOne({
        _id,
        'sessions.token': token
    })
}

UserSchema.statics.findByCrendentials = function (email, password) {
    let user = this;
    return user.findOne({ email }).then((user) => {
        if (!user) return Promise.reject();
        return new Promise((resolve, reject) => {
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) resolve(user);
                else {
                    reject();
                }
            })
        })
    })
}

UserSchema.statics.hasRefreshTokenExpired = (expiresAt) => {
    let secondsSinceEpoch = Date.now() / 1000;
    if (expiresAt > secondsSinceEpoch) {
        //hasn't expired
        return false;
    } else {
        //has expired
        return true;
    }
}

/** MIDDLEWARE **/
//before a user document is saved, this code runs.
UserSchema.pre('save', function (next) {
    let user = this;
    let costFactor = 10;

    if (user.isModified('password')) {
        //if the password fiels has been edited/changed then run this code.
        //generate salt and hash password
        bcrypt.genSalt(costFactor, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    } else {
        next();
    }

})

/*Helper methods*/

let saveSessionToDatabase = (user, refreshToken) => {
    //save session to database
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();
        user.sessions.push({ 'token': refreshToken, expiresAt });
        user.save().then(() => {
            //saved session successfully
            return resolve(refreshToken);
        }).catch((e) => {
            reject(e);
        })
    })
}

let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = "10";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
}

const User = mongoose.model('User', UserSchema);
module.exports(User);