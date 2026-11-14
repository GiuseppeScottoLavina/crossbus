//#region src/PenpalError.ts
var PenpalError = class extends Error {
	code;
	constructor(code, message) {
		super(message);
		this.name = "PenpalError";
		this.code = code;
	}
};
//#endregion
//#region src/errorSerialization.ts
/**
* Converts an error object into a plain object.
*/
const serializeError = (error) => ({
	name: error.name,
	message: error.message,
	stack: error.stack,
	penpalCode: error instanceof PenpalError ? error.code : void 0
});
/**
* Converts a plain object into an error object.
*/
const deserializeError = ({ name, message, stack, penpalCode }) => {
	const deserializedError = penpalCode ? new PenpalError(penpalCode, message) : new Error(message);
	deserializedError.name = name;
	deserializedError.stack = stack;
	return deserializedError;
};
//#endregion
//#region src/Reply.ts
const brand$1 = Symbol("Reply");
var Reply = class {
	value;
	transferables;
	#brand = brand$1;
	constructor(value, options) {
		this.value = value;
		this.transferables = options?.transferables;
	}
};
//#endregion
//#region src/namespace.ts
var namespace_default = "penpal";
//#endregion
//#region src/guards.ts
const isObject = (value) => {
	return typeof value === "object" && value !== null;
};
const isFunction = (value) => {
	return typeof value === "function";
};
const isMessage = (data) => {
	return isObject(data) && data.namespace === "penpal";
};
const isSynMessage = (message) => {
	return message.type === "SYN";
};
const isAck1Message = (message) => {
	return message.type === "ACK1";
};
const isAck2Message = (message) => {
	return message.type === "ACK2";
};
const isCallMessage = (message) => {
	return message.type === "CALL";
};
const isReplyMessage = (message) => {
	return message.type === "REPLY";
};
const isDestroyMessage = (message) => {
	return message.type === "DESTROY";
};
//#endregion
//#region src/methodPath.ts
const getMethodAtMethodPath = (methodPath, methods) => {
	const result = methodPath.reduce((acc, pathSegment) => {
		if (!isObject(acc) || !Object.hasOwn(acc, pathSegment)) return;
		return acc[pathSegment];
	}, methods);
	return isFunction(result) ? result : void 0;
};
const formatMethodPath = (methodPath) => {
	return methodPath.join(".");
};
//#endregion
//#region src/connectCallHandler.ts
const createErrorReplyMessage = (channel, callId, error) => ({
	namespace: namespace_default,
	channel,
	type: "REPLY",
	callId,
	isError: true,
	...error instanceof Error ? {
		value: serializeError(error),
		isSerializedErrorInstance: true
	} : { value: error }
});
/**
* Listens for "call" messages from the remote, executes the corresponding method,
* and responds with the return value or error.
*/
const connectCallHandler = (messenger, methods, channel, log) => {
	let isDestroyed = false;
	const handleCallMessage = async (message) => {
		if (isDestroyed) return;
		if (!isCallMessage(message)) return;
		log?.(`Received ${formatMethodPath(message.methodPath)}() call`, message);
		const { methodPath, args, id: callId } = message;
		let replyMessage;
		let transferables;
		try {
			const method = getMethodAtMethodPath(methodPath, methods);
			if (!method) throw new PenpalError("METHOD_NOT_FOUND", `Method \`${formatMethodPath(methodPath)}\` is not found.`);
			let value = await method(...args);
			if (value instanceof Reply) {
				transferables = value.transferables;
				value = await value.value;
			}
			replyMessage = {
				namespace: namespace_default,
				channel,
				type: "REPLY",
				callId,
				value
			};
		} catch (error) {
			replyMessage = createErrorReplyMessage(channel, callId, error);
		}
		if (isDestroyed) return;
		try {
			log?.(`Sending ${formatMethodPath(methodPath)}() reply`, replyMessage);
			messenger.sendMessage(replyMessage, transferables);
		} catch (error) {
			if (error.name === "DataCloneError") {
				replyMessage = createErrorReplyMessage(channel, callId, error);
				log?.(`Sending ${formatMethodPath(methodPath)}() reply`, replyMessage);
				messenger.sendMessage(replyMessage);
			}
			throw error;
		}
	};
	const handleMessage = (message) => {
		handleCallMessage(message).catch((error) => {
			console.error(error);
		});
	};
	messenger.addMessageHandler(handleMessage);
	return () => {
		isDestroyed = true;
		messenger.removeMessageHandler(handleMessage);
	};
};
//#endregion
//#region src/generateId.ts
/**
* @return A unique ID
*/
const generateId = crypto.randomUUID?.bind(crypto) ?? (() => new Array(4).fill(0).map(() => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16)).join("-"));
//#endregion
//#region src/CallOptions.ts
const brand = Symbol("CallOptions");
var CallOptions = class {
	transferables;
	timeout;
	#brand = brand;
	constructor(options) {
		this.transferables = options?.transferables;
		this.timeout = options?.timeout;
	}
};
//#endregion
//#region src/connectRemoteProxy.ts
const methodsToTreatAsNative = /* @__PURE__ */ new Set([
	"apply",
	"call",
	"bind"
]);
const createRemoteProxy = (callback, log, path = []) => {
	return new Proxy(path.length ? () => {} : Object.create(null), {
		get(target, prop) {
			if (prop === "then") return;
			if (path.length && methodsToTreatAsNative.has(prop)) return Reflect.get(target, prop);
			return createRemoteProxy(callback, log, [...path, prop]);
		},
		apply(target, _thisArg, args) {
			return callback(path, args);
		}
	});
};
const getDestroyedConnectionMethodCallError = (methodPath) => {
	return new PenpalError("CONNECTION_DESTROYED", `Method call ${formatMethodPath(methodPath)}() failed due to destroyed connection`);
};
/**
* Creates a proxy. When methods are called on the proxy, a "call" message will
* be sent to the remote, the remote's corresponding method will be
* executed, and the method's return value will be returned via a message.
*/
const connectRemoteProxy = (messenger, channel, log) => {
	let isDestroyed = false;
	const replyHandlers = /* @__PURE__ */ new Map();
	const handleMessage = (message) => {
		if (!isReplyMessage(message)) return;
		const { callId, value, isError, isSerializedErrorInstance } = message;
		const replyHandler = replyHandlers.get(callId);
		if (!replyHandler) return;
		replyHandlers.delete(callId);
		clearTimeout(replyHandler.timeoutId);
		log?.(`Received ${formatMethodPath(replyHandler.methodPath)}() reply`, message);
		if (isError) replyHandler.reject(isSerializedErrorInstance ? deserializeError(value) : value);
		else replyHandler.resolve(value);
	};
	messenger.addMessageHandler(handleMessage);
	const remoteProxy = createRemoteProxy((methodPath, args) => {
		if (isDestroyed) throw getDestroyedConnectionMethodCallError(methodPath);
		const callId = generateId();
		const lastArg = args[args.length - 1];
		const lastArgIsOptions = lastArg instanceof CallOptions;
		const { timeout, transferables } = lastArgIsOptions ? lastArg : {};
		const argsWithoutOptions = lastArgIsOptions ? args.slice(0, -1) : args;
		return new Promise((resolve, reject) => {
			const timeoutId = timeout !== void 0 ? globalThis.setTimeout(() => {
				replyHandlers.delete(callId);
				reject(new PenpalError("METHOD_CALL_TIMEOUT", `Method call ${formatMethodPath(methodPath)}() timed out after ${timeout}ms`));
			}, timeout) : void 0;
			replyHandlers.set(callId, {
				methodPath,
				resolve,
				reject,
				timeoutId
			});
			try {
				const callMessage = {
					namespace: namespace_default,
					channel,
					type: "CALL",
					id: callId,
					methodPath,
					args: argsWithoutOptions
				};
				log?.(`Sending ${formatMethodPath(methodPath)}() call`, callMessage);
				messenger.sendMessage(callMessage, transferables);
			} catch (error) {
				replyHandlers.delete(callId);
				clearTimeout(timeoutId);
				reject(new PenpalError("TRANSMISSION_FAILED", error.message));
			}
		});
	}, log);
	const destroy = () => {
		isDestroyed = true;
		messenger.removeMessageHandler(handleMessage);
		for (const { methodPath, reject, timeoutId } of replyHandlers.values()) {
			clearTimeout(timeoutId);
			reject(getDestroyedConnectionMethodCallError(methodPath));
		}
		replyHandlers.clear();
	};
	return {
		remoteProxy,
		destroy
	};
};
//#endregion
//#region src/shakeHands.ts
/**
* Attempts to establish communication with the remote via a handshake protocol.
* The handshake protocol fulfills a few requirements:
*
* 1. One participant in the handshake may not be available when the other
*    participant starts the handshake. For example, a document inside an iframe
*    may not be loaded when the parent window starts a handshake.
* 2. While #1 could be solved by having the consumer of Penpal specify which
*    participant should initiate the handshake, we'd rather avoid this
*    unnecessary cognitive load.
* 3. While #1 could be solved by having the consumer of Penpal specify which
*    participant is the "parent" or "child" and then having Penpal assume
*    the child should initiate the handshake, we'd rather avoid parent-child
*    terminology since Penpal can support communication between two
*    participants where neither would be considered a parent nor child. It may
*    also be too presumptive that the child should always initiate the
*    handshake.
* 4. For robustness, each participant must know that the other participant is
*    receiving its messages for the handshake to be considered complete.
* 5. The handshake should support a participant attempting to
*    re-establish the connection. This can occur, for example, if an end user
*    were to right-click within an iframe and click reload.
* 6. The handshake should allow a Messenger to easily attach something to
*    a handshake message from one participant to the other unidirectionally
*    (rather than from both participants to each other).
*    This is important when a participant needs to be in charge of, for
*    example, creating a MessageChannel and sending one MessagePort from the
*    MessagePort pair to the other participant. If both participants attempted
*    to do this it could lead to confusion.
* 7. The handshake ideally shouldn't require sending handshake messages on an
*    interval (retrying until the other participant is ready to receive them).
*    Intervals can increase compute resources if the interval is too short
*    or increase latency if the interval is too long. While we could make this
*    configurable, it's additional mental load for the consumer. Additionally,
*    setInterval and setTimeout are not available within some contexts
*    (like AudioWorklet), where a consumer may like to use Penpal.
*
* To accomplish these requirements, the handshake protocol is as follows:
* 1. Each participant generates a random participant ID.
* 2. As soon as possible, each participant sends a SYN message containing its
*    participant ID to the other participant.
* 3. When the SYN messages were sent, one of the participants may not have
*    been ready to receive the SYN message from the other. At least one
*    of the participants was ready, however, and should have received a SYN
*    message from the other participant. Each participant that did receive
*    a SYN message knows for sure that the other participant is now ready
*    to receive a SYN message, so it will send another SYN message in case
*    the other participant did not receive the first SYN message. This
*    ultimately results in each participant sending two SYN messages.
* 4. Each participant now should have received at least one SYN message from
*    the other participant. Each participant compares their own ID with the
*    other participant's ID. Whichever participant has the higher ID
*    (using a simple string comparison) is considered the handshake leader
*    and will send an ACK1 message to the other participant.
* 5. At this point, the handshake leader does not know whether the other
*    participant is actually receiving messages. The participant receiving
*    the ACK1 message will respond with an ACK2, informing the handshake
*    leader that it is indeed receiving messages.
* 6. At this point, both participants know the other is receiving messages
*    and the handshake is complete.
*/
const shakeHands = ({ messenger, methods, timeout, channel, log }) => {
	const participantId = generateId();
	let remoteParticipantId;
	const destroyHandlers = [];
	let isComplete = false;
	let isDestroyed = false;
	const { promise, resolve, reject } = Promise.withResolvers();
	const timeoutId = timeout !== void 0 ? setTimeout(() => {
		rejectAndCleanUp(new PenpalError("CONNECTION_TIMEOUT", `Connection timed out after ${timeout}ms`));
	}, timeout) : void 0;
	const cleanUp = () => {
		clearTimeout(timeoutId);
		for (const destroyHandler of destroyHandlers.splice(0)) destroyHandler();
	};
	const rejectAndCleanUp = (error) => {
		if (isDestroyed) return;
		isDestroyed = true;
		cleanUp();
		reject(error);
	};
	const destroy = () => {
		rejectAndCleanUp(new PenpalError("CONNECTION_DESTROYED", "Connection destroyed"));
	};
	const completeHandshake = () => {
		if (isDestroyed || isComplete) return;
		destroyHandlers.push(connectCallHandler(messenger, methods, channel, log));
		const { remoteProxy, destroy: destroyMethodProxies } = connectRemoteProxy(messenger, channel, log);
		destroyHandlers.push(destroyMethodProxies);
		clearTimeout(timeoutId);
		isComplete = true;
		resolve(remoteProxy);
	};
	const sendHandshakeMessage = (message) => {
		if (isDestroyed) return false;
		log?.(`Sending handshake ${message.type}`, message);
		try {
			messenger.sendMessage(message);
			return true;
		} catch (error) {
			rejectAndCleanUp(new PenpalError("TRANSMISSION_FAILED", error.message));
			return false;
		}
	};
	const sendSynMessage = () => {
		return sendHandshakeMessage({
			namespace: namespace_default,
			type: "SYN",
			channel,
			participantId
		});
	};
	const handleSynMessage = (message) => {
		log?.(`Received handshake SYN`, message);
		if (message.participantId === remoteParticipantId) return;
		remoteParticipantId = message.participantId;
		if (!sendSynMessage()) return;
		if (!(participantId > remoteParticipantId)) return;
		if (!sendHandshakeMessage({
			namespace: "penpal",
			channel,
			type: "ACK1"
		})) return;
	};
	const handleAck1Message = (message) => {
		log?.(`Received handshake ACK1`, message);
		if (sendHandshakeMessage({
			namespace: "penpal",
			channel,
			type: "ACK2"
		})) completeHandshake();
	};
	const handleAck2Message = (message) => {
		log?.(`Received handshake ACK2`, message);
		completeHandshake();
	};
	const handleMessage = (message) => {
		if (isDestroyed) return;
		if (isSynMessage(message)) handleSynMessage(message);
		else if (isAck1Message(message)) handleAck1Message(message);
		else if (isAck2Message(message)) handleAck2Message(message);
	};
	messenger.addMessageHandler(handleMessage);
	destroyHandlers.push(() => messenger.removeMessageHandler(handleMessage));
	sendSynMessage();
	return {
		promise,
		destroy
	};
};
//#endregion
//#region src/once.ts
const once = (fn) => {
	let isCalled = false;
	let result;
	return (...args) => {
		if (!isCalled) {
			isCalled = true;
			result = fn(...args);
		}
		return result;
	};
};
//#endregion
//#region src/connect.ts
const usedMessengers = /* @__PURE__ */ new WeakSet();
const getConnectionDestroyedError = () => {
	return new PenpalError("CONNECTION_DESTROYED", "Connection destroyed");
};
/**
* Attempts to establish communication with the remote.
*/
const connect = ({ messenger, methods = {}, timeout, channel, log }) => {
	if (!messenger) throw new PenpalError("INVALID_ARGUMENT", "messenger must be defined");
	if (usedMessengers.has(messenger)) throw new PenpalError("INVALID_ARGUMENT", "A messenger can only be used for a single connection");
	usedMessengers.add(messenger);
	const connectionPromise = Promise.withResolvers();
	let isConnectionDestroyed = false;
	let destroyHandshake;
	const sendDestroyMessage = () => {
		const destroyMessage = {
			namespace: namespace_default,
			channel,
			type: "DESTROY"
		};
		try {
			messenger.sendMessage(destroyMessage);
		} catch (_) {}
	};
	const destroyConnection = once((connectionPromiseRejection, notifyOtherParticipant) => {
		isConnectionDestroyed = true;
		if (notifyOtherParticipant) sendDestroyMessage();
		messenger.destroy();
		destroyHandshake?.();
		connectionPromise.reject(connectionPromiseRejection);
		log?.("Connection destroyed");
	});
	const validateReceivedMessage = (data) => {
		return isMessage(data) && data.channel === channel;
	};
	(async () => {
		try {
			messenger.initialize({
				log,
				validateReceivedMessage
			});
			messenger.addMessageHandler((message) => {
				if (isDestroyMessage(message)) destroyConnection(getConnectionDestroyedError(), false);
			});
			const handshake = shakeHands({
				messenger,
				methods,
				timeout,
				channel,
				log
			});
			destroyHandshake = handshake.destroy;
			const remoteProxy = await handshake.promise;
			if (isConnectionDestroyed) {
				handshake.destroy();
				return;
			}
			connectionPromise.resolve(remoteProxy);
		} catch (error) {
			destroyConnection(error, true);
		}
	})();
	return {
		promise: connectionPromise.promise,
		destroy: () => {
			destroyConnection(getConnectionDestroyedError(), true);
		}
	};
};
//#endregion
//#region src/messengers/WindowMessenger.ts
/**
* Handles the details of communicating with a child window.
*/
var WindowMessenger = class {
	#remoteWindow;
	#allowedOrigins;
	#log;
	#validateReceivedMessage;
	#concreteRemoteOrigin;
	#messageCallbacks = /* @__PURE__ */ new Set();
	#port;
	constructor({ remoteWindow, allowedOrigins }) {
		if (!remoteWindow) throw new PenpalError("INVALID_ARGUMENT", "remoteWindow must be defined");
		this.#remoteWindow = remoteWindow;
		this.#allowedOrigins = allowedOrigins?.length ? allowedOrigins : [window.origin];
	}
	initialize = ({ log, validateReceivedMessage }) => {
		this.#log = log;
		this.#validateReceivedMessage = validateReceivedMessage;
		window.addEventListener("message", this.#handleMessageFromRemoteWindow);
	};
	sendMessage = (message, transferables) => {
		if (isSynMessage(message)) {
			const originForSending = this.#getOriginForSendingMessage(message);
			this.#remoteWindow.postMessage(message, {
				targetOrigin: originForSending,
				...transferables === void 0 ? {} : { transfer: transferables }
			});
			return;
		}
		if (isAck1Message(message)) {
			const originForSending = this.#getOriginForSendingMessage(message);
			this.#remoteWindow.postMessage(message, {
				targetOrigin: originForSending,
				...transferables === void 0 ? {} : { transfer: transferables }
			});
			return;
		}
		if (isAck2Message(message)) {
			const { port1, port2 } = new MessageChannel();
			this.#setPort(port1);
			const transferablesToSend = [port2, ...transferables || []];
			const originForSending = this.#getOriginForSendingMessage(message);
			try {
				this.#remoteWindow.postMessage(message, {
					targetOrigin: originForSending,
					transfer: transferablesToSend
				});
			} catch (error) {
				this.#destroyPort();
				port2.close();
				throw error;
			}
			return;
		}
		if (this.#port) {
			this.#port.postMessage(message, { ...transferables === void 0 ? {} : { transfer: transferables } });
			return;
		}
		throw new PenpalError("TRANSMISSION_FAILED", "Cannot send message because the MessagePort is not connected");
	};
	addMessageHandler = (callback) => {
		this.#messageCallbacks.add(callback);
	};
	removeMessageHandler = (callback) => {
		this.#messageCallbacks.delete(callback);
	};
	destroy = () => {
		window.removeEventListener("message", this.#handleMessageFromRemoteWindow);
		this.#destroyPort();
		this.#messageCallbacks.clear();
	};
	#isAllowedOrigin = (origin) => {
		return this.#allowedOrigins.some((allowedOrigin) => {
			if (allowedOrigin instanceof RegExp) return new RegExp(allowedOrigin).test(origin);
			return allowedOrigin === origin || allowedOrigin === "*";
		});
	};
	#getOriginForSendingMessage = (message) => {
		if (isSynMessage(message)) return "*";
		if (!this.#concreteRemoteOrigin) throw new PenpalError("TRANSMISSION_FAILED", "Cannot send message because the remote origin is not established");
		return this.#concreteRemoteOrigin === "null" && this.#allowedOrigins.includes("*") ? "*" : this.#concreteRemoteOrigin;
	};
	#destroyPort = () => {
		this.#port?.removeEventListener("message", this.#handleMessageFromPort);
		this.#port?.close();
		this.#port = void 0;
	};
	#setPort = (port) => {
		this.#destroyPort();
		this.#port = port;
		this.#port.addEventListener("message", this.#handleMessageFromPort);
		this.#port.start();
	};
	#handleMessageFromRemoteWindow = ({ source, origin, ports, data }) => {
		if (source !== this.#remoteWindow) return;
		if (!this.#validateReceivedMessage?.(data)) return;
		if (!this.#isAllowedOrigin(origin)) {
			this.#log?.(`Received a message from origin \`${origin}\` which did not match allowed origins \`[${this.#allowedOrigins.join(", ")}]\``);
			return;
		}
		if (isSynMessage(data)) {
			this.#destroyPort();
			this.#concreteRemoteOrigin = origin;
		}
		if (isAck2Message(data)) {
			const port = ports[0];
			if (!port) {
				this.#log?.("Ignoring ACK2 because it did not include a MessagePort");
				return;
			}
			this.#setPort(port);
		}
		for (const callback of this.#messageCallbacks) callback(data);
	};
	#handleMessageFromPort = ({ data }) => {
		if (!this.#validateReceivedMessage?.(data)) return;
		for (const callback of this.#messageCallbacks) callback(data);
	};
};
//#endregion
//#region src/messengers/WorkerMessenger.ts
/**
* Handles the details of communicating with a child web worker.
*/
var WorkerMessenger = class {
	#worker;
	#log;
	#validateReceivedMessage;
	#messageCallbacks = /* @__PURE__ */ new Set();
	#port;
	constructor({ worker }) {
		if (!worker) throw new PenpalError("INVALID_ARGUMENT", "worker must be defined");
		this.#worker = worker;
	}
	initialize = ({ log, validateReceivedMessage }) => {
		this.#log = log;
		this.#validateReceivedMessage = validateReceivedMessage;
		this.#worker.addEventListener("message", this.#handleMessage);
	};
	sendMessage = (message, transferables) => {
		if (isSynMessage(message) || isAck1Message(message)) {
			this.#worker.postMessage(message, { ...transferables === void 0 ? {} : { transfer: transferables } });
			return;
		}
		if (isAck2Message(message)) {
			const { port1, port2 } = new MessageChannel();
			this.#setPort(port1);
			try {
				this.#worker.postMessage(message, { transfer: [port2, ...transferables || []] });
			} catch (error) {
				this.#destroyPort();
				port2.close();
				throw error;
			}
			return;
		}
		if (this.#port) {
			this.#port.postMessage(message, { ...transferables === void 0 ? {} : { transfer: transferables } });
			return;
		}
		throw new PenpalError("TRANSMISSION_FAILED", "Cannot send message because the MessagePort is not connected");
	};
	addMessageHandler = (callback) => {
		this.#messageCallbacks.add(callback);
	};
	removeMessageHandler = (callback) => {
		this.#messageCallbacks.delete(callback);
	};
	destroy = () => {
		this.#worker.removeEventListener("message", this.#handleMessage);
		this.#destroyPort();
		this.#messageCallbacks.clear();
	};
	#destroyPort = () => {
		this.#port?.removeEventListener("message", this.#handleMessage);
		this.#port?.close();
		this.#port = void 0;
	};
	#setPort = (port) => {
		this.#destroyPort();
		this.#port = port;
		this.#port.addEventListener("message", this.#handleMessage);
		this.#port.start();
	};
	#handleMessage = ({ ports, data }) => {
		if (!this.#validateReceivedMessage?.(data)) return;
		if (isSynMessage(data)) this.#destroyPort();
		if (isAck2Message(data)) {
			const port = ports[0];
			if (!port) {
				this.#log?.("Ignoring ACK2 because it did not include a MessagePort");
				return;
			}
			this.#setPort(port);
		}
		for (const callback of this.#messageCallbacks) callback(data);
	};
};
//#endregion
//#region src/messengers/PortMessenger.ts
/**
* Handles the details of communicating on a MessagePort.
*/
var PortMessenger = class {
	#port;
	#validateReceivedMessage;
	#messageCallbacks = /* @__PURE__ */ new Set();
	constructor({ port }) {
		if (!port) throw new PenpalError("INVALID_ARGUMENT", "port must be defined");
		this.#port = port;
	}
	initialize = ({ validateReceivedMessage }) => {
		this.#validateReceivedMessage = validateReceivedMessage;
		this.#port.addEventListener("message", this.#handleMessage);
		this.#port.start();
	};
	sendMessage = (message, transferables) => {
		this.#port?.postMessage(message, { ...transferables === void 0 ? {} : { transfer: transferables } });
	};
	addMessageHandler = (callback) => {
		this.#messageCallbacks.add(callback);
	};
	removeMessageHandler = (callback) => {
		this.#messageCallbacks.delete(callback);
	};
	destroy = () => {
		this.#port.removeEventListener("message", this.#handleMessage);
		this.#port.close();
		this.#messageCallbacks.clear();
	};
	#handleMessage = ({ data }) => {
		if (!this.#validateReceivedMessage?.(data)) return;
		for (const callback of this.#messageCallbacks) callback(data);
	};
};
//#endregion
//#region src/ErrorCodeObj.ts
const ErrorCodeObj = {
	ConnectionDestroyed: "CONNECTION_DESTROYED",
	ConnectionTimeout: "CONNECTION_TIMEOUT",
	InvalidArgument: "INVALID_ARGUMENT",
	MethodCallTimeout: "METHOD_CALL_TIMEOUT",
	MethodNotFound: "METHOD_NOT_FOUND",
	TransmissionFailed: "TRANSMISSION_FAILED"
};
//#endregion
//#region src/debug.ts
const debug = (prefix) => {
	return (...args) => {
		console.log(`✍️ %c${prefix}%c`, "font-weight: bold;", "", ...args);
	};
};
//#endregion
export { CallOptions, ErrorCodeObj as ErrorCode, PenpalError, PortMessenger, Reply, WindowMessenger, WorkerMessenger, connect, debug };

//# sourceMappingURL=penpal.mjs.map