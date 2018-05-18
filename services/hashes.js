/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const _ = require('lodash'),
  nem = require('nem-sdk').default,
  ByteBuffer = require('bytebuffer'),
  keccak_256 = require('js-sha3').keccak_256;

const hex2Buffer = (hex) => {
  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);
  const ccc = nem.utils.convert.hex2ua(hex);

  bb.writeUint32(ccc.length);
  bb.append(ccc);
  bb.flip();

  return bb;
};

const serializeEmptyObject = () => {
  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN); 
  bb.flip();
  return bb;
};

const serializeEmpty = () => {
  const emptyBuffer = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN); 
  emptyBuffer.writeUint32(0);
  emptyBuffer.flip();
  return emptyBuffer;
};

const serializeObject = (buffer) => {
  if (buffer.limit === 0) 
    return serializeEmpty();
  

  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);
  bb.writeUint32(buffer.limit);
  bb.append(buffer);
  bb.flip();

  return bb;
};

const serializeObjectArray = (objects, serializeFields) => {
  if (objects === null) 
    return serializeEmpty();
  
  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);
  bb.writeUint32(objects.length);
  _.each(objects, obj => bb.append(serializeObject(serializeFields(obj))));
  bb.flip();
  return bb;
};

const serializeEmptyString = () => {
  const emptyBuffer = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN); 
  emptyBuffer.writeUint8(-1);
  emptyBuffer.writeUint8(-1);
  emptyBuffer.writeUint8(-1);
  emptyBuffer.writeUint8(-1);
  emptyBuffer.flip();
  return emptyBuffer;
};

const serializeChars = (string) => {
  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);
  bb.writeString(string);
  bb.flip();

  return bb;
};

const serializeString = (string) => {
  if (string == null) 
    return serializeEmptyString();   
  

  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);
  const charsBb = serializeChars(string);
  bb.writeUint32(charsBb.limit);
  bb.append(charsBb);
  bb.flip();
  
  return bb;
};

const MOSAIC_VERSION = 2;
const isMosaicVersion = (version) => {
  return ((version & 0x00FFFFFF) === MOSAIC_VERSION);
};

const serializeTransferTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeString(transaction.recipient));
  bb.writeUint64(transaction.amount);
  bb.append(serializeObject(serializeMessage(transaction.message)));
  if (isMosaicVersion(transaction.version)) 
    bb.append(serializeObjectArray(transaction.mosaics, serializeMosaics));
  
  bb.flip();    
    
  return bb;
};

const serializeImportanceTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.writeUint32(transaction.mode);
  bb.append(hex2Buffer(transaction.remoteAccount));
  bb.flip();    
  return bb;
};

const isVersionModificable = (version) => {
  return ((version & 0x00FFFFFF) >= MOSAIC_VERSION);
};



const serializeMultisigAggregateTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeObjectArray(transaction.modifications, serializeModification));
  if (isVersionModificable(transaction.version)) 
    bb.append(serializeObject(serializeMinCosignatories(transaction.minCosignatories)));
  
  bb.flip();        
  return bb;
};

const serializeMultisigTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeObject(serializeOtherTrans(transaction.otherTrans)));
    
  if (includeVerifyable) 
    bb.append(serializeObjectArray(transaction.signatures, serializeMultisigSignatureTransaction));
  
  bb.flip();
  return bb;
};

const serializeMultisigSignatureTransaction = (transaction, includeVerifyable = true) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeObject(hex2Buffer(transaction.otherHash.data)));
  bb.append(serializeString(transaction.otherAccount));
  bb.flip();
  return bb;
};

const serializeProvisionNamespaceTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeString(transaction.rentalFeeSink));
  bb.writeUint64(transaction.rentalFee);    
  bb.append(serializeString(transaction.newPart));
  bb.append(serializeString(transaction.parent || null));
  bb.flip();
  return bb;
};
const serializeMosaicDefinitionTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeObject(serializeMosaicDefinition(transaction.mosaicDefinition)));
  bb.append(serializeString(transaction.creationFeeSink));
  bb.writeUint64(transaction.creationFee);
  bb.flip();
  return bb;
};

const serializeMosaicSupplyTypeTransaction = (transaction, includeVerifyable) => {
  const bb = serializeCoreTransaction(transaction, includeVerifyable);
  bb.append(serializeObject(serializeMosaicId(transaction.mosaicId)));
  bb.writeUint32(transaction.supplyType);
  bb.writeUint64(transaction.delta);
  bb.flip();
  return bb;
};

const TRANSACTION_TYPES = {
  TRANSFER_TYPE: 257,
  IMPORTANCE_TRANSFER_TYPE: 2049,
  MULTISIG_AGGREGATE_TYPE: 4097,
  MULTISIG_TYPE: 4100,
  MULTISIG_SIGNATURE_TYPE: 4098,
  PROVISION_NAMESPACE_TYPE: 8193,
  MOSAIC_DEFINITION_CREATION_TYPE: 16385,
  MOSAIC_SUPPLY_CHANGE_TYPE: 16386
};
const TRANSACTION_TYPE_HANDLERS = {
  [TRANSACTION_TYPES.TRANSFER_TYPE]: serializeTransferTransaction,
  [TRANSACTION_TYPES.IMPORTANCE_TRANSFER_TYPE]: serializeImportanceTransaction,
  [TRANSACTION_TYPES.MULTISIG_AGGREGATE_TYPE]: serializeMultisigAggregateTransaction,        
  [TRANSACTION_TYPES.MULTISIG_TYPE]: serializeMultisigTransaction,        
  [TRANSACTION_TYPES.MULTISIG_SIGNATURE_TYPE]: serializeMultisigSignatureTransaction,        
  [TRANSACTION_TYPES.PROVISION_NAMESPACE_TYPE]: serializeProvisionNamespaceTransaction,
  [TRANSACTION_TYPES.MOSAIC_DEFINITION_CREATION_TYPE]: serializeMosaicDefinitionTransaction,
  [TRANSACTION_TYPES.MOSAIC_SUPPLY_CHANGE_TYPE]: serializeMosaicSupplyTypeTransaction
};

const serializeCoreTransaction = (transaction, includeVerifyable) => {
  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);
  bb.writeUint32(transaction.type);
    
  bb.writeUint32(transaction.version);
  bb.writeUint32(transaction.timeStamp);
  bb.append(hex2Buffer(transaction.signer).buffer);

  if (includeVerifyable) 
    bb.append(hex2Buffer(transaction.signature).buffer);
  
  bb.writeUint64(transaction.fee);
  bb.writeUint32(transaction.deadline);


  return bb;
};

const serializeTransaction = (transaction, includeVerifyable = true) => {
  if (TRANSACTION_TYPE_HANDLERS[transaction.type] === undefined) 
    throw new Error(`unknown nem transaction type ${transaction.type}`);
  
  return TRANSACTION_TYPE_HANDLERS[transaction.type](transaction, includeVerifyable);
};


const serializeBlock = (block) => {
  const bb = new ByteBuffer(2, ByteBuffer.LITTLE_ENDIAN);
  bb.writeUint32(block.type);
    
  bb.writeUint32(block.version);
  bb.writeUint32(block.timeStamp);
  bb.append(hex2Buffer(block.signer).buffer);
  bb.append(serializeObject(hex2Buffer(block.prevBlockHash.data)));
  bb.writeUint64(block.height);

  bb.append(serializeObjectArray(block.transactions, serializeTransaction));
    
  bb.flip();


  return bb;
};

const serializeEntity = (object, fieldFiller) => {
  if (_.isEmpty(object)) 
    return serializeEmptyObject();
  

  const bb = new ByteBuffer(0, ByteBuffer.LITTLE_ENDIAN);     
  fieldFiller(bb);
  bb.flip();
  return bb;
};



const serializeMessage = (message) => {
  return serializeEntity(message, (bb) => {
    bb.writeUint32(message.type);    
    bb.append(hex2Buffer(message.payload));
  });
};

const serializeMinCosignatories = (minCosignatories) => {
  return serializeEntity(minCosignatories, (bb) => {
    bb.writeUint32(minCosignatories.relativeChange);
  });
};

const serializeMosaicProperty = (property) => {
  return serializeEntity(property, (bb) => {
    bb.append(serializeString(property.name));
    bb.append(serializeString(property.value));
  });
};

const serializeLevy = (levy) => {
  return serializeEntity(levy, (bb) => {
    bb.writeUint32(levy.type);
    bb.append(serializeString(levy.recipient));
    bb.append(serializeObject(serializeMosaicId(levy.mosaicId)));
    bb.writeUint64(levy.fee);
  });
};

const serializeMosaicDefinition = (definition) => {
  return serializeEntity(definition, (bb) => {
    bb.append(hex2Buffer(definition.creator));    
    bb.append(serializeObject(serializeMosaicId(definition.id)));  
    bb.append(serializeString(definition.description));
        
    bb.append(serializeObjectArray(definition.properties, serializeMosaicProperty));
    bb.append(serializeObject(serializeLevy(definition.levy)));
  });  
};

const serializeOtherTrans = (trans) => {
  if (_.isEmpty(trans)) 
    return serializeEmptyObject();
   
  return serializeTransaction(trans, false);
};

const serializeMosaicId = (mosaicId) => {
  return serializeEntity(mosaicId, (bb) => {
    bb.append(serializeString(mosaicId.namespaceId));
    bb.append(serializeString(mosaicId.name));
  });
};



const serializeMosaics = (mosaics) => {
  return serializeEntity(mosaics, (bb) => {
    bb.append(serializeObject(serializeMosaicId(mosaics.mosaicId)));    
    bb.writeUint64(mosaics.quantity);
  });
};

const serializeModification = (modification) => {
  return serializeEntity(modification, (bb) => {
    bb.writeUint32(modification.modificationType);    
    bb.append(hex2Buffer(modification.cosignatoryAccount).buffer);
  });
};

const calculateHash = (buffer) => {
  return keccak_256(buffer.toArrayBuffer());
};

const calculateBlockHash = (block) => {
  return calculateHash(serializeBlock(block));
};

const calculateTransactionHash = (transaction) => {
  return calculateHash(serializeTransaction(transaction, false));
};


module.exports = {
  calculateBlockHash,
  calculateTransactionHash,
  TRANSACTION_TYPES
};
