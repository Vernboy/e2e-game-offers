exports = async function(changeEvent) {
  
  /*
   * This function will change the state of the Player Profile and Roster according to the offer that was purchased
   * and set the purchaseDt on the offer.
   * The changes are performed under a transaction
   *
   * Date          Version        Author            Notes
   * ---------------------------------------------------------------------
   * 2021-06-11    1.0            Sig Narvaez       Initial version
   *
   */
  
    //Access the _id of the changed document:
    const offerId = changeEvent.documentKey._id;

    const updateDescription = changeEvent.updateDescription;

    //See which fields were changed (if any):
    if (updateDescription) {
      
      const updatedFields = updateDescription.updatedFields; // A document containing updated fields
      
      // Verify isPurchased==true and purchaseDt != null
      if (!updatedFields.isPurchased) return; // Exit if the offer is not purchased
      
      const client = context.services.get("mongodb-atlas");
      const db = client.db("game");
      const rosterCollection = db.collection("playerRoster");
      const playerCollection = db.collection("playerProfile");
      const offerCollection = db.collection("playerOffers");
      
      const purchasedOffer = changeEvent.fullDocument;
      
      // Step 1: Start a Client Session
      const session = client.startSession();
      
      // Step 2: Define options to use for the transaction (optional) - Where are they used?
      const transactionOptions = {
        readPreference: "primary",
        readConcern: { level: "local" },
        writeConcern: { w: "majority" },
      };
  
      // Step 3: Start ACID Tx
      try {
        let modifiedRoster, modifiedPlayer, modifiedOffer;
        
        await session.withTransaction(async () => {
          
          // Increment TotalMoneySpent on Player
          modifiedPlayer = await playerCollection.findOneAndUpdate(
            { "playerId": purchasedOffer.playerId },
            { $inc: { "stats.totalMoneySpent": purchasedOffer.price } },
            { session }
          );
          
          // Increment Character shards on Roster
          modifiedRoster = await rosterCollection.findOneAndUpdate(
            { "playerId": purchasedOffer.playerId, "roster.characterId": purchasedOffer.characterId },
            { $inc: { "roster.$.shards": purchasedOffer.shards } },
            { session }
          );
          
          modifiedOffer = await offerCollection.findOneAndUpdate(
            { "_id": offerId },
            { "$set" : { "purchaseDt" : new Date() }}
          );
          
        }, transactionOptions);
        
        console.log(`MOD: [playerProfile] ${JSON.stringify(modifiedPlayer)}`);
        console.log(`MOD: [playerRoster] ${JSON.stringify(modifiedRoster)}`);
        console.log(`MOD: [playerOffers] ${JSON.stringify(modifiedOffer)}`);
        console.log(`TX: COMMITTED`);
        
      } catch (err) {
        // Step 5a: Handle errors with a transaction abort
        console.log(`TX: ABORTED. CATCH: ${err}`);
        await session.abortTransaction();
      }
    }
};
