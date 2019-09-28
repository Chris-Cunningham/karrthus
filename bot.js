var Discord = require('discord.io');
var logger = require('winston');
var auth = require('./auth.json');
var https = require('https');
var gm = require('gm');
var fs = require('fs');
var download = require('image-downloader')

// Configure logger settings
logger.remove(logger.transports.Console);
logger.add(new logger.transports.Console, {
    colorize: true
});
logger.level = 'debug';
// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});
bot.on('ready', function (evt) {
    logger.info('Connected');
    logger.info('Logged in as: ');
    logger.info(bot.username + ' - (' + bot.id + ')');
    bot.setPresence( {game: {name:"Skyrim"}});
});

function shuffle(array1, array2) {
  // Knuth Shuffle on two arrays at the same time.
  var currentIndex = array1.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue1 = array1[currentIndex];
    temporaryValue2 = array2[currentIndex];
    array1[currentIndex] = array1[randomIndex];
    array2[currentIndex] = array2[randomIndex];
    array1[randomIndex] = temporaryValue1;
    array2[randomIndex] = temporaryValue2;
  }

  // Return the two newly-shuffled arrays. 
  return [array1, array2];
}


async function prepareCardImages(cardNameArray) {

    // If you have an array of card names, you can pass it to prepareCardImages.
    // prepareCardImages returns one single, large promise: "I will get all those card images ready for you."
    // That promise is built from an array of promises, one for each card: "I will get that card image ready for you," created by a different function.
    // If the function can't get even one of the card images ready, the promise will be rejected, so you should be ready for that. 
    
    const individualCardPromises = [];              // This is the array that will hold all the individual promises.
    for(let cardNumber = 0; cardNumber < cardNameArray.length; cardNumber++) {       
        // For each card in the array, append this card's promise to the array. The individual card's promise comes from prepareCardImage(). 
        individualCardPromises.push(prepareCardImage(cardNameArray[cardNumber]));    
    }
    return Promise.all(individualCardPromises);     // This combines the array of promises into one large promise: I promise to fulfill all the small promises.
}


async function prepareCardImage(cardName) {

    // Given the exact name of a card, you can pass it to prepareCardImage.
    // prepareCardImage returns a promise to get that card's image ready for you.
    // This function will look for the card image locally, and it if doesn't exist, it will try to download the image from Scryfall.
    // If Scryfall rejects the request or the card isn't an exact card name, this promise won't be fulfilled.
    return new Promise( function(resolve, reject) {

        // First we ask the file system to see if the card is stored locally. imageFileName() tells us where to look.
        fs.access(imageFileName(cardName), fs.F_OK, (err) => {
            if (err) {
                // Apparently the file isn't there or at least we can't reach it, so let's download it.
                // The scryfall api allows for you to look for cards named *exactly* what you say with 'https://api.scryfall.com/cards/named?exact=
                //                                                   or you can get a fuzzy match with 'https://api.scryfall.com/cards/named?fuzzy=
                // Here we will use the exact match. I'm not entirely sure what happens when you get multiple versions of a card.
                https.get('https://api.scryfall.com/cards/named?exact='+cardName, (resp) => {

                    // When you get something with https.get, you get little chunks of data that you have to manually assemble.
                    let data = '';
                    // A chunk of data has been recieved.
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });

                    // resp.on('end') triggers when the whole response has been received.
                    resp.on('end', () => {
                        
                        try {
                            // The scryfall API response should be a JSON object.
                            scryfall = JSON.parse(data);
                        } catch (error) {
                            // If the data from the response is not a JSON object, something has gone very wrong and we will need to reject the promise.
                            reject(Error("The data from Scryfall's API for "+cardName+" could not be parsed."));
                            return;
                        }

                        if (scryfall.object == 'error') {
                            // If you request an exact match for something that doesn't exactly match a card, Scryfall returns a structure
                            // with object "error" and information in the details. When this happens, we've failed to find the card
                            // image locally, and also failed to find the card URL from scryfall, so we will have to go back on our promise.

                            // We can pass the details from Scryfall back through so that whoever deals with the broken promise can log it.
                            reject(Error("Scryfall's API reported: " + resp.details));
                            return;
                        } else {
                            // If we get something that isn't an error, we are in business.
                            // Get the image URI for the small card image.
                            imagesrc = scryfall.image_uris.normal
                            options = {
                              url: imagesrc,
                              dest: imageFileName(cardName)      
                            }
                            // download.image() comes from the image-downloader requirement. It downloads the image at "url" to "dest."
                            download.image(options).then( ({ filename, image }) => {
                                // We did it! The image is downloaded!
                                resolve(true);
                                return;
                            }).catch((err) => {
                                // Oh, we didn't do it. The image download failed somehow. Time to break our promise.
                                reject(Error("The image download from Scryfall was unsuccessful: "+err.message));
                                return;
                            }); // End of download.image().
                        }   
                    }); // End of resp.on('end').
                }); // End of https.get().
            } else {
                // If we are here, the fs.access() attempt succeeded and we skipped all the Scryfall stuff,
                // which means the file is already available for use locally!
                resolve(true);
                return;
            }
        }); // end of fs.access().
    }); // End of the returned promise.
}

function imageFileName(cardName) {
    // Where do you want to store your images, and in what format?
    return "./images/"+cardName+".jpg"
}
 


bot.on('message', function (user, userID, channelID, message, evt) {
    // Most importantly, the bot has to demand respect. If someone misspells its name, that needs to be corrected.
    if (message.toLowerCase().includes("karthus")) {
        bot.sendMessage({
            to: channelID,
            message: "It's Karrthus."
        });
        // Karrthus will remember this.
        logger.info(user + " in " + channelID + " spelled my name wrong and got corrected.");
    }

    // Our bot needs to know if it will execute a command.
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {

        // Use the standard format, that the first word after the ! is the name of a command, and the rest is arguments.
        var args = message.substring(1).split(' ');
        var cmd = args[0];
        // Chop the command name off of the args so the "args" array is really just the arguments. Then arg[0] will be the first argument.       
        args = args.splice(1);

        // Handle commands with switch{ case }. At the end of each "case", you need a "break."
        switch(cmd) {

            case 'build':
                // This command builds a Jund deck by randomly choosing spells that a Jund deck could contain.
                // The joke here is that all Jund decks are basically indistinguishable from someone rolling a bunch of d4s.

                // Start with a list of all the spells that Jund can play.
                var spells = ['Maelstrom Pulse','Lightning Bolt','Tarmogoyf','Scavenging Ooze','Liliana of the Veil','Tireless Tracker','Bloodbraid Elf','Wrenn and Six','Fatal Push','Inquisition of Kozilek','Thoughtseize','Abrupt Decay',"Assassin's Trophy","Kolaghan's Command","Seasoned Pyromancer","Elvish Reclaimer","Dark Confidant"]
                // Make an array of 0s that is as long as the list of spells.
                var amounts = new Array(spells.length).fill(0);
                // We always have one Maelstrom Pulse. This was determined long ago, when the first Jund player made a sacrifice to Karthus.
                // Ever since then, Karrthus has watched over us all, and Jund players who Believe always draw their 1 Maelstrom Pulse when it is needed most.
                amounts[0] = 1
                // Oh! Also we always have at least 3 Bolts. Not 4 of course, that would be too consistent.
                amounts[1] = 3
                // Since we started with 1 Pulse and 3 Bolts, we started with a spell count of 4.
                spellcount = 4

                // Let's keep adding cards to the deck until we get to 36.
                while (spellcount < 36) {
                    // Choose a random card from the list.
                    card = Math.floor(Math.random() * spells.length)

                    // If we don't have 4 of it yet and it isn't maelstrom pulse, add 1.
                    if (amounts[card] < 4 && card > 0) {
                        amounts[card] += 1
                        spellcount += 1    
                    }
                }

                // Shuffle the arrays around so no one notices we always start with 1 Maelstrom Pulse. True Believers will know, but no need to betray the secrets of Jund.
                shuffle_result = shuffle(spells, amounts)
                spellslist = shuffle_result[0]
                countslist = shuffle_result[1]

                // Now make a human-readable version.
                output = ''
                // Loop through the array of all possible Jund spells.
                for (i = 0; i < spellslist.length; i++) {
                    // If we actually ended up playing any of this one,
                    if (countslist[i] > 0) {
                        // Include it in the list.
                        output += '\n '
                        output += countslist[i].toString()
                        output += 'x '
                        output += spellslist[i]
                    }
                }

                // Send the results as a message to the channel that requested it, with text that seems like it would fit into the Jund discord.
                bot.sendMessage({
                    to: channelID,
                    message: "This spell suite has felt really good to me. I don't have a manabase ready yet."+output
                });
                break;

            case 'pulse':
                // If anyone asks about the right number of Maelstrom Pulse to play, they are likely not aware of the Pact of Jund. Help educate them.
                bot.sendMessage({
                    to: channelID,
                    message: "1x Maelstrom Pulse"
                });
                break;

            case 'hand':
                // The user has requested a sample hand from a magic deck stored on MTGGoldfish.
                // The syntax is !hand N n, where N is the number of an MTGGoldfish deck, and n is the number of cards to draw (optional, default 7).

                // Blank !hand gets help with the syntax.
                if (args.length < 1) {
                    bot.sendMessage({
                        to: channelID,
                        message: 'Syntax: !hand N n, where N is the decklist number of an MTGGoldfish deck, and n is 7 or less.'
                    });
                    break;
                } 

                // The MTGGoldfish deck number is the first argument.
                decknumber = args[0];
                if (isNaN(decknumber)) {
                    // That should be a number. I know not all MTGGoldfish decks are stored as a number, but I don't want 
                    // users to be able to have my bot look for super weird URLs, so this is a reasonable restriction toward that goal.
                    bot.sendMessage({
                        to: channelID,
                        message: 'Syntax: !hand N n, where N is the decklist number of an MTGGoldfish deck, and n is 7 or less.'
                    });
                    break;
                } 

                // The default hand size will be 7.
                let handsize = 7;
                if (args.length >= 2) {
                    if (!isNaN(args[1])) {
                        if (parseInt(args[1]) < 7) {
                            // If there is a second argument and it is a number AND it is less than 7, we can use that.
                            handsize = parseInt(args[1]);
                        }

                    }

                }

                // Okay, we need to go get the decklist now.
                https.get('https://www.mtggoldfish.com/deck/download/'+decknumber, (resp) => {
                    // When you get something with https.get, you get little chunks of data that you have to manually assemble.
                    let data = '';
                    // A chunk of data has been recieved.
                    resp.on('data', (chunk) => {
                        data += chunk;
                    });

                    // The whole response has been received. Use the result to find a hand now.
                    resp.on('end', () => {
                        logger.info(user + " in " + channelID + " asked about MTGGoldfish deck " + decknumber + " and got response: " + resp.statusCode);
                        if (resp.statusCode == "200") {
                            // We are now looking for "handsize" cards from the deck contained in the variable "data".                        
                            // Let's parse the decklist first. Split it on new lines.
                            let deck = data.split('\n');
                            let decksize = 0;

                            // Loop through each line of the decklist.
                            for (i=0; i<deck.length; i++) {
                                entry = deck[i].split(' ');     // Example: entry is now ['12','Snow-Covered','Plains']
                                first = entry[0]                // Example: first is now '12'
                                if (isNaN(parseInt(first))) {
                                    // The first line that does not have a number at the beginning of it indicates the end of the maindeck, so stop here.
                                    if (decksize < 60) {
                                        // We should always end up with at least 60 cards, but if not, give a warning.
                                        logger.info("Warning: "+user + " in " + channelID + " requested " + handsize + " cards from " + decknumber + " and got a maindeck with only" + decksize + "cards.");
                                    }
                                    break;
                                } else {
                                    // If this line starts with a number, it indicates another new card to add to the decklist.
                                    number = parseInt(first);       // Example: number is now 12
                                    decksize += number
                                }
                            }
                            if (handsize > decksize) {
                                // We shouldn't be able to get here really, but let's avoid an infinite while loop.
                                // If we are requesting more cards than can be drawn from the deck, don't make the hand.
                                logger.info("ERROR: "+user + " in " + channelID + " requested " + handsize + " cards from " + decknumber + " which only has" + decksize + "cards.");

                                // Note the function we are "returning" from is the () => inside resp.on('end').
                                return;                         
                            } 

                            // If we are here, this implies that it should be possible to make a hand of cards from the deck.
                            // Now we will make our hand. 
                            let hand = []
                            let cardNameArray = []
                            let fileNameArray = []
                            while (hand.length < handsize) {
                                // Choose a random number up to the deck size.
                                cardnumber = Math.floor(Math.random() * decksize);
                                // Only include it if we haven't already chosen this one.
                                if (!hand.includes(cardnumber)) {
                                    hand.push(cardnumber);
                                }
                            }
                            // Put the cards in numerical order.
                            hand.sort(function(a, b){return a-b});
                            
                            // At this point, the hand is a list of numbers corresponding to positions in the deck. Example: [5, 9, 10, 14, 53, 58, 59] 
                            
                            // Prepare the final hand output.
                            let handoutput = '\n'
                            
                            // We start at line 0 of the deck. Here a "line" is like "12 Snow-Covered Plains\n"
                            currentline = 0;

                            // We have already looked at 0 of this card.
                            alreadysaw = 0;

                            // Now go through the decklist grabbing cards that you drew as you hit them.
                            for (i=0; i<decksize; i++) {
                                // We are looking at the current line. If alreadysaw is 2, that means we previously looked at the 2nd Snow-Covered Plains.
                                // Now we are looking at the 3rd Snow-Covered Plains.
                                alreadysaw += 1;

                               // If we are looking at the 13th Snow-Covered Plains,
                                if (alreadysaw > deck[currentline][0]) {
                                    // We are actually looking at the next line,
                                    currentline += 1;
                                    // And the first card of that line.
                                    alreadysaw = 1;
                                }

                                // If the hand actually includes this card,
                                if (hand.includes(i)) {
                                    // get the card name from the entry and add it on.
                                    let cardName = deck[currentline].substr(deck[currentline].indexOf(' ')+1).trim().toLowerCase()
                                    handoutput += cardName + '\n';

                                    cardNameArray.push(cardName)
                                    fileNameArray.push(imageFileName(cardName))
                                }
                            }

                            // prepareCardImages returns a promise to get all the card images ready. 
                            // If that promise resolves successfully, then ".then" will execute.
                            prepareCardImages(cardNameArray).then( () => {

                                // GraphicsMagick instantiates with a starting image; we'll use te first one from the hand.
                                var gmstate = gm(fileNameArray[0]);

                                // Then it loops through each additional image, and `appends` the image to what we already have. The "true" makes it append horizontally.
                                for (var i = 1; i < fileNameArray.length; i++) gmstate.append(fileNameArray[i], true);

                                // Finally, write out the file asynchronously.
                                // Use the Channel ID for the file name, in case there are multiple requests from multiple channels.
                                // At least this way if they get mixed up, people will understand the mixup.
                                let handfilename = './hands/'+channelID+'.png'
                                gmstate.write(handfilename, (err) => {
                                    if (err) {
                                        logger.info(user + " in " + channelID + " tried to stitch a hand together and got an error: " + err.message); 
                                    } else {
                                        logger.info(user + " in " + channelID + " successfully requested " + handsize + " cards from " + decknumber);
                                        bot.uploadFile({
                                            to: channelID,
                                            file: handfilename,
                                            message: 'A '+handsize+' card hand from <https://www.mtggoldfish.com/deck/'+decknumber + '> :'
                                        });
                                    }
                                }); // End of gmstate.write().
                            
                            }).catch( (err) => {
                            
                                // In this case, the promise to prepare the card images went unfulfilled.
                                logger.info(user + " in " + channelID + " tried to prepare images but failed: " +err.message)
                            
                            }); // End of prepareCardImages().

                        } else {
                            // In this situation, we got a reply from MTGGoldfish that was not status code 200.
                            bot.sendMessage({
                                to: channelID,
                                message: 'You requested a hand from https://www.mtggoldfish.com/deck/'+decknumber+', but that does not seem to lead to a decklist.'
                            });
                        }

                    }); // End of resp.on(end) for the MTGGoldfish https.get decklist lookup.

                }).on("error", (err) => {
                  logger.info(user + " in " + channelID + " requested "+decknumber+" and got error: " + err.message);
                }); // end of https.get().

                break; 
            
            // More case commands go at this level.

        } // End of switch(cmd) 

    } // End of checking to see if the message starts with '!'

}); // End of bot.on('message')