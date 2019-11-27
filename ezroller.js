import { Item5e } from "../../systems/dnd5e/module/item/entity.js";

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
	 * checks removed.
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

		// Get the target
		const target = isTargetted ? Item5e._getChatCardTarget(card) : null;

		// Attack and Damage Rolls
		if ( action === "attack" ) await item.rollAttack({event});
		else if ( action === "damage" ) await item.rollDamage({event});
		else if ( action === "versatile" ) await item.rollDamage({event, versatile: true});

		// Saving Throw
		else if ( action === "save" ) await target.rollAbilitySave(button.dataset.ability, {event});

		// Consumable usage
		else if ( action === "consume" ) await item.rollConsumable({event});

		// Tool usage
		else if ( action === "toolCheck" ) await item.rollToolCheck({event});

		// Re-enable the button
		button.disabled = false;
	}

	/*
	 * Copied from dnd5e/module/item/entity.js with the permissions
	 * checks removed.
	 */
	static async _onFooterAction(event) {
		let thtml = $(this.object.html);

		thtml.addClass('ezroller-approved');
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

			if (thtml.hasClass('item-card') && thtml.hasClass('chat-card') && thtml.find('button').length > 0 && !thtml.hasClass('ezroller-approved')) {
				let actorId = thtml.attr('data-actor-id');
				let itemId = thtml.attr('data-item-id');
				let title = thtml.find('h3').first().html();

				new ItemWindow({'chatdata':html, 'title':title, 'html':html.content, 'actorId':actorId, 'itemId':itemId}, {}).render(true);
				return false;
			}
		}
	});
});
