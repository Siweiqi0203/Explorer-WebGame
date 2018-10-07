var gamejs = require('gamejs');
var global = require('global');
var box2d = require('./Box2dWeb-2.1.a.3');
var object = require('object');
var level = require('level');
var ui = require('ui');
//------------------------------------------------------------------------------
// IE doesn't take Ogg
var AUDIO_EXT = ".ogg";
var IE = false;
if (window.navigator.appName == "Microsoft Internet Explorer") {
	AUDIO_EXT = ".mp3";
	IE = true;
}

//------------------------------------------------------------------------------
// preload everything, call main when done
var data = [
	global.DATA_PATH + "block00_1.png",
	global.DATA_PATH + "block00_2.png",
	global.DATA_PATH + "block00_3.png",
	global.DATA_PATH + "block01_1.png",
	global.DATA_PATH + "block01_2.png",
	global.DATA_PATH + "block01_3.png",
	global.DATA_PATH + "block02_1.png",
	global.DATA_PATH + "block02_2.png",
	global.DATA_PATH + "block02_3.png",
	global.DATA_PATH + "block03_1.png",
	global.DATA_PATH + "block03_2.png",
	global.DATA_PATH + "block03_3.png",
	global.DATA_PATH + "msg_crown.png",
	global.DATA_PATH + "msg_drop.png",
	global.DATA_PATH + "msg_end.png",
	global.DATA_PATH + "msg_end1.png",
	global.DATA_PATH + "msg_fail.png",
	global.DATA_PATH + "msg_fail1.png",
	global.DATA_PATH + "msg_pick.png",
	global.DATA_PATH + "msg_princess.png",
	global.DATA_PATH + "msg_win.png",
    global.DATA_PATH + "msg_win1.png",
	global.DATA_PATH + "knight00_0.png",
	global.DATA_PATH + "knight00_1.png",
	global.DATA_PATH + "knight00_2.png",
	global.DATA_PATH + "knight01_0.png",
	global.DATA_PATH + "knight01_1.png",
	global.DATA_PATH + "knight01_2.png",
	global.DATA_PATH + "knight02_0.png",
	global.DATA_PATH + "knight02_1.png",
	global.DATA_PATH + "knight02_2.png",
	global.DATA_PATH + "princess.png",
	global.DATA_PATH + "princess.png",
	global.DATA_PATH + "floor0.png",
	global.DATA_PATH + "floor1.png",
	global.DATA_PATH + "timer0.png",
	global.DATA_PATH + "timer1.png",
	global.DATA_PATH + "title.png",
	global.DATA_PATH + "vbar.png",
	global.DATA_PATH + "tune_building" + AUDIO_EXT,
	global.DATA_PATH + "tune_defending" + AUDIO_EXT,
	global.DATA_PATH + "tune_end" + AUDIO_EXT,
	global.DATA_PATH + "tune_lost" + AUDIO_EXT,
	global.DATA_PATH + "tune_win" + AUDIO_EXT,
];
gamejs.preload(data);
gamejs.ready(main);

//------------------------------------------------------------------------------
// game state
var STATE_BUILDING = 0;
var STATE_DEFENDING = 1;
var STATE_LOST = 2;
var STATE_WIN = 3;
var gState = STATE_BUILDING;
var gStateTimer = 0.0;
var gDefendingNextSpawn = 0.0;
var gDefendingNextLeft = true;

//------------------------------------------------------------------------------
// gameplay elements
var NUM_BLOCK_KINDS = 4;
var gBlockStore = null;
var gBlockStoreInventory = null;
var gBlockStoreYOffsets = null;
var gBlockSet = null;
var gBlockPickup = null;
var gFloor = null;
var gKnightSet = null;
var gLevelIndex = 0;

//------------------------------------------------------------------------------
// Box2D stuff
var b2World = null;
var b2Draw = false;

//------------------------------------------------------------------------------
// UI stuff
var gFont = null;
var gTitle = null;
var gVBarLeft = null;
var gVBarRight = null;
var gMsg = null;
var gTimer = null;

//------------------------------------------------------------------------------
// UI stuff
var gTune = null;

//------------------------------------------------------------------------------
// entry point
function main() {

    init(gLevelIndex);
    gamejs.time.fpsCallback(update, this, 24);
}

//------------------------------------------------------------------------------
// create everything
function init(levelIndex) {
    // set display size
    gamejs.display.setMode([1024, 768]);
    // create Box2D world
    b2World = new box2d.b2World(
       new box2d.b2Vec2(0, 10),  // gravity
       true                      // allow sleep
    );

    // add our contact listener
    // http://stackoverflow.com/questions/10878750/box2dweb-collision-contact-point
    var b2Listener = box2d.Box2D.Dynamics.b2ContactListener;
	var listener = new b2Listener;
    listener.BeginContact = function(contact) {
        //console.log(contact.GetFixtureA().GetBody().GetUserData());
    }
    listener.EndContact = function(contact) {
        // console.log(contact.GetFixtureA().GetBody().GetUserData());
    }
    listener.PostSolve = function(contact, impulse) {
		var objectA = contact.GetFixtureA().GetBody().GetUserData();
		var objectB = contact.GetFixtureB().GetBody().GetUserData();
        if ((objectA.kind == "knight" && objectB.kind == "princess") || (objectA.kind == "princess" && objectB.kind == "knight")) {
			if (gState == STATE_DEFENDING) {
				gState = STATE_LOST;
				if(gLevelIndex<=3)
				gMsg = new ui.msg("fail", [300, 150]);
				else gMsg = new ui.msg("fail1", [300, 150]);
			}
		} else if (objectA.kind == "knight" && objectB.kind == "block") {
			objectA.hit = true;
			if(objectA.index==2){
				objectB.hit();
				}
			objectB.hit();
		} else if (objectA.kind == "block" && objectB.kind == "knight") {
			if(objectB.index==2){
				objectA.hit();
				}
			objectA.hit();
			objectB.hit = true;
		}
    }
    listener.PreSolve = function(contact, oldManifold) {
        // PreSolve
    }
    b2World.SetContactListener(listener);
	
    // setup debug draw
    var debugDraw = new box2d.b2DebugDraw();
    debugDraw.SetSprite(document.getElementById("gjs-canvas").getContext("2d"));
    debugDraw.SetDrawScale(global.BOX2D_SCALE);
    debugDraw.SetFillAlpha(0.3);
    debugDraw.SetLineThickness(1.0);
    debugDraw.SetFlags(box2d.b2DebugDraw.e_shapeBit | box2d.b2DebugDraw.e_jointBit);
    b2World.SetDebugDraw(debugDraw);

    // create block store
	gBlockStoreInventory = level.constants[levelIndex].blocks.slice(0); // NB: array deep copy http://stackoverflow.com/a/7486130/1005455
    gBlockStore = new gamejs.sprite.Group();
	gBlockStoreYOffsets = new Array();
	if (gLevelIndex >= 1) {
		gBlockStore.add(new object.block([700, 166], "princess"));
	}
	var currentY = 250;
    for (var i=0; i<NUM_BLOCK_KINDS; i++) {
		if (gBlockStoreInventory[i] > 0) {
			var newBlock = new object.block([100, currentY], i);
			gBlockStore.add(newBlock);
			gBlockStoreYOffsets[i] = currentY;
			currentY += newBlock.image.getSize()[1] + 20;
		}
    }
   
    // create empty block & knight sets
    gBlockSet = new gamejs.sprite.Group();
    gKnightSet = new gamejs.sprite.Group();

    // create floor
    gFloor = new object.floor([0, 0], b2World, gLevelIndex);

	// create UI
	gFont = new gamejs.font.Font("20px sans-serif");
	gVBarLeft = new ui.vbar(512 - level.constants[gLevelIndex].dropAreaWidth * 0.5);
	gVBarRight = new ui.vbar(512 + level.constants[gLevelIndex].dropAreaWidth * 0.5);
	gTimer = new ui.timer(gLevelIndex);
	
	if (levelIndex == 0) {
		gMsg = new ui.msg("pick", [150, 180]);
	}
		
	gState = STATE_BUILDING;
}
    
//------------------------------------------------------------------------------
// gather input then draw
function update(dt) {
    var events = gamejs.event.get();
    debugInput(events);
    switch (gState)
    {
        case STATE_BUILDING: updateBuilding(events, dt); break;
        case STATE_DEFENDING: updateDefending(events, dt); break;
        case STATE_LOST: updateLost(events, dt); break;
        case STATE_WIN: updateWin(events, dt); break;
    }
	gStateTimer += dt;

    // update physics
    b2World.Step(
        1 / 24,  //frame-rate
        10,      //velocity iterations
        10       //position iterations
    );
    b2World.ClearForces();

    // update gameplay elements
    gBlockSet.forEach(function(block) {
        block.update(dt);
		
		// in building state, hit blocks getting outside the drop area
		if (gState == STATE_BUILDING) {
			block.checkDropArea(level.constants[gLevelIndex].dropAreaWidth);
		}
		
		if (block.type != "princess" && block.hp <= 0) {
			block.die(b2World);
			gBlockSet.remove(block);
		}
    });
    gKnightSet.forEach(function(knight) {
        knight.update(dt);
		if (knight.hit) {
			knight.die(b2World);
			gKnightSet.remove(knight);
		}
    });

    draw();    
}

//------------------------------------------------------------------------------
// debug keys
function debugInput(events) {
    
    events.forEach(function(event) {
        if (event.type === gamejs.event.KEY_DOWN) {
            if (event.key === gamejs.event.K_b) {
                b2Draw = true;
            };
        } else if (event.type === gamejs.event.KEY_UP) {
            if (event.key === gamejs.event.K_b) {
                b2Draw = false;
            };
        }
    });
}

//------------------------------------------------------------------------------
// building state
function updateBuilding(events, dt) {
    
    events.forEach(function(event) {
		// block picking
				if (event.key === gamejs.event.K_SPACE) {
					}
        if (event.type === gamejs.event.MOUSE_DOWN) {
            gBlockStore.forEach(function(block) {
                if (block.rect.collidePoint(event.pos)) {
                    if (block.index == "princess") {
						// picked a princess
                        gBlockStore.remove(block);
                        gBlockPickup = block;
						
						if (gLevelIndex == 0) {
							gMsg = new ui.msg("crown", [410, 150]);
						}
                    } else {
						
						if (gMsg) {
							gMsg = new ui.msg("drop", [410, 150]);
						}
						
						// picked a regular block
						if (0 == (--gBlockStoreInventory[block.index])) {
							// that was the last one
							gBlockStore.remove(block);
							gBlockPickup = block;
							
						} else {
							// there are blocks remaining, create a new instance
							gBlockPickup = new object.block(block.rect.topleft, block.index);
						}
                    }
                }
            });
		// block dropping
        } else if (event.type === gamejs.event.MOUSE_UP) {
            if (gBlockPickup) {
				if (gMsg) {
					gMsg = null;
				}
				
                gBlockPickup.turnOnPhysics(b2World);
                gBlockSet.add(gBlockPickup);
                if (gBlockPickup.index == "princess") {
                    // switch to defending state!
                    gState = STATE_DEFENDING;
                    gStateTimer = 0.0;
                    gDefendingNextSpawn = 2000.0;
                    gDefendingNextLeft = true;
					//playTune("defending");
                } else  {
					// no more blocks in store, add the princess (level 0 - tutorial)
					if (gBlockStore._sprites.length == 0) {
						if (gLevelIndex == 0) {
							gMsg = new ui.msg("princess", [380, 220]);
							gBlockStore.add(new object.block([700, 250], "princess"));
						}
					}
				}
				
                gBlockPickup = null;
            }
		// block dragging
        } else if (event.type === gamejs.event.MOUSE_MOTION) {
            if (gBlockPickup) {
                gBlockPickup.rect.center = event.pos;
            }
        }
    });
}

//------------------------------------------------------------------------------
// defending state
function updateDefending(events, dt) {

    if (gStateTimer > gDefendingNextSpawn) {
        
		// spawn knights
		var knightIndex = Math.random(); // spawn a goat once in a while
		if(knightIndex>0.5){
			knightIndex = 0;
			}else if(knightIndex>0.2){
				knightIndex = 1;
				}else{
					knightIndex = 2;
					}
        if (gDefendingNextLeft) {
            gKnightSet.add(new object.knight([0, 630], knightIndex, b2World, gDefendingNextLeft));
        } else {
            gKnightSet.add(new object.knight([1024-80, 630], knightIndex, b2World, gDefendingNextLeft));
        }                
        
        gDefendingNextSpawn += 2000.0;
        gDefendingNextLeft = !gDefendingNextLeft;
    }
    
	var duration = level.constants[gLevelIndex].duration;
	var timeLeft = (duration - gStateTimer) / 1000;
	if (timeLeft < 0) {
		if (gLevelIndex == (level.constants.length-1)) {
			gMsg = new ui.msg("end1", [260, 180]);
			//playTune("end");
		} else {
			if(gLevelIndex<=3)
			gMsg = new ui.msg("win", [300, 150]);
			else gMsg = new ui.msg("win1", [300, 150]);
		}
		gState = STATE_WIN;
	}
}

//------------------------------------------------------------------------------
// lost state
function updateLost(events, dt) {
	
	var restart = false;
    events.forEach(function(event) {
        if (event.type === gamejs.event.KEY_UP) {
            if (event.key === gamejs.event.K_SPACE) {
                restart = true;
            };
        } else if (event.type === gamejs.event.MOUSE_UP) {
			restart = true;
        }
    });
	
	if (restart) {
		gMsg = null;
		init(gLevelIndex);
	}
}

//------------------------------------------------------------------------------
// win state
function updateWin(events, dt) {
	// skip, the game is finished
	if (gLevelIndex == (level.constants.length-1)) {
		return;
	}
	
	var next = false;
    events.forEach(function(event) {
        if (event.type === gamejs.event.KEY_UP) {
            if (event.key === gamejs.event.K_SPACE) {
				next = true;
            };
        } else if (event.type === gamejs.event.MOUSE_UP) {
			next = true;
        }
    });	
	
	if (next) {
		gMsg = null;
		init(++gLevelIndex);
	}		
}

//------------------------------------------------------------------------------
// draw
function draw() {
    
    //gamejs.display.getSurface().fill('white');
    var mainSurface = gamejs.display.getSurface();

	// those need to be drawn before the floor


    gFloor.draw(mainSurface);

	if (gState == STATE_BUILDING)
	{
		gVBarLeft.draw(mainSurface);
		gVBarRight.draw(mainSurface);
	}
	// draw message
	if (gMsg) {
		gMsg.draw(mainSurface);
	}

	if (gBlockPickup) {
        gBlockPickup.draw(mainSurface);
    }

	gBlockSet.draw(mainSurface);
    
	gKnightSet.draw(mainSurface);
    
    if (b2Draw) {
        b2World.DrawDebugData();
    }
	
	// draw title
	//gTitle.draw(mainSurface);
	
    // draw game state UI
    switch (gState)
    {
        case STATE_BUILDING: drawBuilding(mainSurface); break;
        case STATE_DEFENDING: drawDefending(mainSurface); break;
        case STATE_LOST: drawLost(mainSurface); break;
        case STATE_WIN: drawWin(mainSurface); break;
    }
	
	// draw level #
	if(gLevelIndex<=3){
	mainSurface.blit(gFont.render("Level " + (gLevelIndex + 1)), [950,10]);
	}else
	{
		mainSurface.blit(gFont.render("Level " + (gLevelIndex + 1),"white"), [950,10]);
	}
}

//------------------------------------------------------------------------------
// draw building
function drawBuilding(surface) {	
	gBlockStore.draw(surface);
	for (var i=0; i<NUM_BLOCK_KINDS; ++i) {
		if (gBlockStoreInventory[i] > 0) {
			if(gLevelIndex<=3){surface.blit(gFont.render("X"+gBlockStoreInventory[i]), [66, gBlockStoreYOffsets[i] + 15]);}
			else surface.blit(gFont.render("X"+gBlockStoreInventory[i],"white"), [66, gBlockStoreYOffsets[i] + 15]);		
		}
	}
}

//------------------------------------------------------------------------------
// draw defending
function drawDefending(surface) {
	
	var duration = level.constants[gLevelIndex].duration;
	var timeLeft = (duration - gStateTimer) / 1000;
	
	gTimer.draw(surface);
	if(gLevelIndex<=3){
	surface.blit(gFont.render(Math.round(timeLeft)), [973,65]);
	}else
	surface.blit(gFont.render(Math.round(timeLeft),"white"), [973,65]);
}

//------------------------------------------------------------------------------
// draw Win and Lost
function drawWin(surface) {
}

function drawLost(surface) {
}

