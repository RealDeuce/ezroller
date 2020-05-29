import Actor5e from "../../systems/dnd5e/module/actor/entity.js";
import Item5e from "../../systems/dnd5e/module/item/entity.js";
import SpellCastDialog from "../../systems/dnd5e/module/apps/spell-cast-dialog.js";
import AbilityTemplate from "../../systems/dnd5e/module/pixi/ability-template.js";

Actor5e.prototype.useSpell = async function(item, {configureDialog=true}={}) {
	return item.roll();
}

class ItemWindow extends FormApplication {
	static get defaultOptions() {
		const options = super.defaultOptions;
		options.id = "ezroller.item-window";
		options.classes = [];
		options.template = "modules/ezroller/itemwindow.html";
		options.width = '400';
		options.height = 'auto';
		return options;
	}

	/* -------------------------------------------- */

	/**
	 * Dynamic sheet title with the token name
	 * @return {String}
	 */
	get title() {
		return this.object.title;
	}

	/* -------------------------------------------- */

	/**
	 * Prepare token configuration data
	 * @returns {Object}  The data object used for Token Config HTML rendering
	 */
	async getData() {
		return {
			"itemhtml": this.object.html
		};
	}

	/*
	 * Copied from dnd5e/module/actor/entity.js with the item.roll calls
	 * removed, and a simple chat message instead, and the item object not
	 * recreated, and the actor passed in explicitly.
	 */
	async useSpell(actor, item, {configureDialog=true}={}) {
		function castAtLevel(l, count) {
			let chatData = {
				user: game.user._id,
				type: CONST.CHAT_MESSAGE_TYPES.OTHER,
				speaker: {
					actor: actor._id,
					token: actor.token,
					alias: actor.name
				}
			};
			if (consume) {
				chatData.content = `<strong>${actor.name}</strong> casts <em>${item.name}</em> using one of ${count} level <strong>${l}</strong> slots.`;
			}
			else {
				chatData.content = `<strong>${actor.name}</strong> casts <em>${item.name}</em>.`;
			}
			if (item.hasSave) {
				let save = item.data.data.save || {};
				if ( !save.ability )
					save.dc = null;
				else if ( item.isOwned ) { // Actor owned items
					if ( save.scaling === "spell" )
						save.dc = item.actor.data.data.attributes.spelldc;
					else if ( save.scaling !== "flat" )
						save.dc = item.actor.getSpellDC(save.scaling);
				} else { // Un-owned items
					if ( save.scaling !== "flat" )
						save.dc = null;
				}
				chatData.content += save.ability ? ` Save DC: ${save.dc || ""} ${CONFIG.DND5E.abilities[save.ability]}.` : "";
			}

			// Initiate ability template placement workflow if selected
			if ( placeTemplate && item.hasAreaTarget ) {
				const template = AbilityTemplate.fromItem(item);
				if ( template ) template.drawPreview(event);
				if ( actor.sheet.rendered ) actor.sheet.minimize();
			}

			return ChatMessage.create(chatData, {displaySheet: false});
		}

		if ( item.data.type !== "spell" ) throw new Error("Wrong Item type");
		const itemData = item.data.data;

		// Configure spellcasting data
		let lvl = itemData.level;
		const usesSlots = (lvl > 0) && CONFIG.DND5E.spellUpcastModes.includes(itemData.preparation.mode);
		const limitedUses = !!itemData.uses.per;
		let consume = `spells${lvl}`;
		let placeTemplate = false;

		// Configure spell slot consumption and measured template placement from the form
		if ( usesSlots && configureDialog ) {
			const spellFormData = await SpellCastDialog.create(actor, item);
			const isPact = spellFormData.get('level') === 'pact';
			const lvl = isPact ? actor.data.data.spells.pact.level : parseInt(spellFormData.get("level"));
			if (Boolean(spellFormData.get("consume"))) {
				consume = isPact ? 'pact' : `spell${lvl}`;
			} else {
				consome = false;
			}
			placeTemplate = Boolean(spellFormData.get("placeTemplate"));
			if ( lvl !== item.data.data.level ) {
				item = item.constructor.createOwned(mergeObject(item.data, {"data.level": lvl}, {inplace: false}), actor);
			} 
		}

		let count = (lvl > 0) ? (actor.data.data.spells["spell"+lvl].value) : 0;
		// Update Actor data
		if ( usesSlots && consume && (lvl > 0) ) {
			await actor.update({
				[`data.spells.${consume}.value`]: Math.max(parseInt(actor.data.data.spells[consume].value) - 1, 0)
			});
		} 

		// Update Item data
		if ( limitedUses ) {
			const uses = parseInt(itemData.uses.value || 0);
			if ( uses <= 0 ) ui.notifications.warn(game.i18n.format("DND5E.ItemNoUses", {name: item.name}));
			await item.update({"data.uses.value": Math.max(parseInt(item.data.data.uses.value || 0) - 1, 0)});
		}

		// Invoke the Item roll
		return castAtLevel(lvl, count);
	}

	/*
	 * Copied from dnd5e/module/item/entity.js with the permissions
	 * checks removed, and use slot added.
	 */
	static async _onChatCardAction(event) {
		event.preventDefault();

		// Extract card data
		const button = event.currentTarget;
		button.disabled = true;
		const card = button.closest(".chat-card");
		//const messageId = card.closest(".message").dataset.messageId;
		//const message =  game.messages.get(messageId);
		const action = button.dataset.action;

		// Validate permission to proceed with the roll
		const isTargetted = action === "save";
		//if ( !( isTargetted || game.user.isGM || message.isAuthor ) ) return;

		// Get the Actor from a synthetic Token
		const actor = Item5e._getChatCardActor(card);
		if ( !actor ) return;

		// Get the Item
		const item = actor.getOwnedItem(card.dataset.itemId);
		if ( !item ) {
			return ui.notifications.error(`The requested item ${card.dataset.itemId} no longer exists on Actor ${actor.name}`)
		}
		const spellLevel = parseInt(card.dataset.spellLevel) || null;

		// Get card targets
		let targets = [];
		if ( isTargetted ) {
			targets = this._getChatCardTargets(card);
			if ( !targets.length ) {
				ui.notifications.warn(`You must have one or more controlled Tokens in order to use this option.`);
				return button.disabled = false;
			}
		}

		// Attack and Damage Rolls
		if ( action === "attack" ) await item.rollAttack({event});
		else if ( action === "damage" ) await item.rollDamage({event, spellLevel});
		else if ( action === "versatile" ) await item.rollDamage({event, spellLevel, versatile: true});
		else if ( action === "formula" ) await item.rollFormula({event});

		// Saving Throws for card targets
		else if ( action === "save" ) {
			for ( let t of targets ) {
				await t.rollAbilitySave(button.dataset.ability, {event});
			}
		}

		// Consumable usage
		else if ( action === "consume" ) await item.rollConsumable({event});

		// Tool usage
		else if ( action === "toolCheck" ) await item.rollToolCheck({event});

		// Spell Template Creation
		else if ( action === "placeTemplate") {
			const template = AbilityTemplate.fromItem(item);
			if ( template ) template.drawPreview(event);
		}

		// Additional button handling...
		else if ( action === "spellSlot" ) await this.useSpell(actor, item);

		// Re-enable the button
		button.disabled = false;
	}

	/*
	 * Copied from dnd5e/module/item/entity.js with the permissions
	 * checks removed.
	 */
	static async _onFooterAction(event) {
		event.preventDefault();
		let thtml = $(this.object.html);

		thtml.addClass('ezroller-approved');
		thtml.find('.card-buttons').remove();
		this.object.chatdata.content = thtml[0].outerHTML;
		await ChatMessage.create(this.object.chatdata);
	}

	/* -------------------------------------------- */

	activateListeners(html) {
		super.activateListeners(html);
		html.on('click', '.card-buttons button', ItemWindow._onChatCardAction.bind(this));
		html.on('click', '.sheet-footer button', ItemWindow._onFooterAction.bind(this));
	}

	/* -------------------------------------------- */

	/**
	 * This method is called upon form submission after form data is validated
	 * @param event {Event}       The initial triggering submission event
	 * @param formData {Object}   The object of validated form data with which to update the object
	 * @private
	 */
	_updateObject(event, formData) {
		console.log("Got it!");
	}

	updatePins(pinned) {
		const pins = game.settings.get('ezroller', 'pins');
		let pin;

		let idx = pins.findIndex(({itemId}) => itemId === this.object.itemId);
		if (pinned !== undefined && idx !== -1) {
			pins.splice(idx, 1);
			game.settings.set('ezroller', 'pins', pins);
			return null;
		}
		if (pinned !== undefined && idx === -1) {
			pin = {'chatdata':this.object.html, 'title':this.object.title, 'html':this.object.html, 'actorId':this.object.actorId, 'itemId':this.object.itemId};
			idx = pins.push(pin) - 1;
		}
		if (idx === -1)
			return null;
		pin = pins[idx];

		pin.x = this.position.left;
		pin.y = this.position.top;
		pin.w = this.position.width;
		pin.h = this.position.height;
		pin.min = this._minimized;
		if (this._skycons !== undefined) {
			pin.skycons = {};
			if (this._minimized) {
				if (this._skycons.maxpos !== undefined)
					pin.skycons.maxpos = {'x':this._skycons.maxpos.x, 'y':this._skycons.maxpos.y};
				pin.skycons.minpos = {'x':this.position.left, 'y':this.position.top};
			}
			else {
				if (this._skycons.minpos !== undefined)
					pin.skycons.minpos = {'x':this._skycons.minpos.x, 'y':this._skycons.minpos.y};
				pin.skycons.maxpos = {'x':this.position.left, 'y':this.position.top};
			}
		}
			
		game.settings.set('ezroller', 'pins', pins);
		return pin;
	}

	async close(...args) {
		await super.close(...args);
		const pins = game.settings.get('ezroller', 'pins');
		const idx = pins.findIndex(({itemId}) => itemId === this.object.itemId);
		pins.splice(idx, 1);
		game.settings.set('ezroller', 'pins', pins);
	}

	async _renderOuter(...args) {
		const html = await super._renderOuter(...args);
		const pin = $('<a class="pin"><i class="fas fa-thumbtack"></i></a>');
		pin.insertBefore(html.find('a.close'));
		if (this.updatePins() === null) {
			pin.css('color', pin.next().css('color'));
		}
		else {
			pin.css('color', 'red');
		}
		pin.click(() => {
			if (this.updatePins(true) === null) {
				pin.css('color', pin.next().css('color'));
			}
			else {
				pin.css('color', 'red');
			}
		});
		return html;
	}

	async minimize(...args) {
		await super.minimize(...args);
		this.updatePins();
	}

	async mazimize(...args) {
		await super.maximize(...args);
		this.updatePins();
	}

	async _onResize(...args) {
		await super._onResize(...args);
		this.updatePins();
	}

	setPosition(...args) {
		super.setPosition(...args);
		this.updatePins();
	}

}


Hooks.on('ready', () => {
	game.settings.register('ezroller', 'pins', {
		name: 'pins',
		default: [],
		scope: 'client'
	});
	Hooks.on('preCreateChatMessage', (html, data, id) => {
		if (html.type === CONST.CHAT_MESSAGE_TYPES.OTHER) {
			let thtml = $(html.content);

			if (thtml.hasClass('item-card') && thtml.hasClass('chat-card') && !thtml.hasClass('ezroller-approved')) {
				let actorId = thtml.attr('data-actor-id');
				let itemId = thtml.attr('data-item-id');
				let title = thtml.find('h3').first().html();
				let actor = game.actors.get(actorId);
				let item = actor.getOwnedItem(itemId);

				// If it's a spell, inject slot using button....
				if (item !== null && item !== undefined && item.data !== undefined && item.data.data !== undefined && item.data.type === 'spell' && (item.data.data.level > 0 || item.hasSave)) {
					thtml.find('.card-buttons').prepend("<button data-action=\"spellSlot\">Cast Spell<!-- TODO: i18n --></button>");
				}
				new ItemWindow({'chatdata':html, 'title':title, 'html':thtml[0].outerHTML, 'actorId':actorId, 'itemId':itemId}, {}).render(true);
				return false;
			}
		}
	});
	const pins = game.settings.get('ezroller', 'pins');
	pins.forEach(async (pin) => {
		let x = pin.x;
		let y = pin.y;
		if (pin.skycons !== undefined && pin.skycons.maxpos !== undefined) {
			x = pin.skycons.maxpos.x;
			y = pin.skycons.maxpos.y;
		}
		const win = new ItemWindow({'chatdata':pin.chatdata, 'title':pin.title, 'html':pin.html, 'actorId':pin.actorId, 'itemId':pin.itemId}, {'left':x, 'top':y});
		if (pin.skycons !== undefined)
			win._skycons = JSON.parse(JSON.stringify(pin.skycons));
		await win._render(true, {'left':x, 'top':y});
		if (pin.min)
			win.minimize();
	});
});
