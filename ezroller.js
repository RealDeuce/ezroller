import { Actor5e } from "../../systems/dnd5e/module/actor/entity.js";
import { Item5e } from "../../systems/dnd5e/module/item/entity.js";
import { SpellCastDialog } from "../../systems/dnd5e/module/apps/spell-cast-dialog.js";

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

			return ChatMessage.create(chatData, {displaySheet: false});
		}

		if ( item.data.type !== "spell" ) throw new Error("Wrong Item type");

		// Determine if the spell uses slots
		let lvl = item.data.data.level;
		let consume = false;
		const usesSlots = (lvl > 0) && item.data.data.preparation.mode === "prepared";
		if ( !usesSlots ) return castAtLevel(item.data.data.level, 0);

		// Configure the casting level and whether to consume a spell slot
		consume = true;
		if ( configureDialog ) {
			const spellFormData = await SpellCastDialog.create(actor, item);
			lvl = parseInt(spellFormData.get("level"));
			consume = Boolean(spellFormData.get("consume"));
			if ( lvl !== item.data.data.level ) {
				item = item.constructor.createOwned(mergeObject(item.data, {"data.level": lvl}, {inplace: false}), actor);
			} 
		}

		// Update Actor data
		let count = actor.data.data.spells["spell"+lvl].value;
		if ( consume && (lvl > 0) ) {
			await actor.update({
				[`data.spells.spell${lvl}.value`]: Math.max(parseInt(actor.data.data.spells["spell"+lvl].value) - 1, 0)
			});
		} 

		// Invoke the Item roll
		return castAtLevel(item.data.data.level, count);
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

		// Get card targets
		const targets = isTargetted ? this._getChatCardTargets(card) : [];
		const spellLevel = parseInt(card.dataset.spellLevel) || null;

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
}


Hooks.on('ready', () => {
	Hooks.on('preCreateChatMessage', (app, html, data) => {
		if (html.type === CONST.CHAT_MESSAGE_TYPES.OTHER) {
			let thtml = $(html.content);

			if (thtml.hasClass('item-card') && thtml.hasClass('chat-card') && !thtml.hasClass('ezroller-approved')) {
				let actorId = thtml.attr('data-actor-id');
				let itemId = thtml.attr('data-item-id');
				let title = thtml.find('h3').first().html();
				let actor = game.actors.get(actorId);
				let item = actor.getOwnedItem(itemId);

				// If it's a spell, inject slot using button....
				if (item !== undefined && item.data !== undefined && item.data.data !== undefined && item.data.type === 'spell' && item.data.data.level > 0) {
					thtml.find('.card-buttons').prepend("<button data-action=\"spellSlot\">Use Spell Slot<!-- TODO: i18n --></button>");
				}
				new ItemWindow({'chatdata':html, 'title':title, 'html':thtml[0].outerHTML, 'actorId':actorId, 'itemId':itemId}, {}).render(true);
				return false;
			}
		}
	});
});
