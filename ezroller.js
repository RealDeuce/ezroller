import Actor5e from "../../systems/dnd5e/module/actor/entity.js";
import Item5e from "../../systems/dnd5e/module/item/entity.js";
import AbilityUseDialog from "../../systems/dnd5e/module/apps/ability-use-dialog.js";
import AbilityTemplate from "../../systems/dnd5e/module/pixi/ability-template.js";

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

		// Recover the Actor for the chat card
		const actor = Item5e._getChatCardActor(card);
		if ( !actor ) return;

		// Get the Item from stored flag data or by the item ID on the Actor
		//const storedData = message.getFlag("dnd5e", "itemData");
		const item = /* storedData ? this.createOwned(storedData, actor) : */actor.getOwnedItem(card.dataset.itemId);
		if ( !item ) {
			return ui.notifications.error(game.i18n.format("DND5E.ActionWarningNoItem", {item: card.dataset.itemId, name: actor.name}));
		}
		const spellLevel = parseInt(card.dataset.spellLevel) || null;

		// Handle different actions
		switch ( action ) {
			case "attack":
				await item.rollAttack({event}); break;
			case "damage":
			case "versatile":
				await item.rollDamage({
					critical: event.altKey,
					event: event,
					spellLevel: spellLevel,
					versatile: action === "versatile"
				});
				break;
			case "formula":
				await item.rollFormula({event, spellLevel}); break;
			case "save":
				const targets = Item5e._getChatCardTargets(card);
				for ( let token of targets ) {
					const speaker = ChatMessage.getSpeaker({scene: canvas.scene, token: token});
					await token.actor.rollAbilitySave(button.dataset.ability, { event, speaker });
				}
				break;
			case "toolCheck":
				await item.rollToolCheck({event}); break;
			case "placeTemplate":
				const template = AbilityTemplate.fromItem(item);
				if ( template ) template.drawPreview();
				break;
		}

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

				// Do not handle spells.
				if (item !== null && item !== undefined && item.data !== undefined && item.data.data !== undefined && item.data.type === 'spell' && (item.data.data.level > 0 || item.hasSave)) {
					return true;
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
