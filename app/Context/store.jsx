"use client"
import React, { useContext, useEffect, useState, useRef, useMemo } from "react"
import { TronLinkAdapter, WalletReadyState } from '@tronweb3/tronwallet-adapters';
import eventData from '../../data/events.json'
// import { TronWeb } from "@/tronweb"; // this imports the tronweb library from tronweb.js (not in node_modules)
const TronWeb = require('../../tronweb')

const AppContext = React.createContext()

const AppProvider = (({children}) => {
    const [readyState, setReadyState] = useState();
    const [account, setAccount] = useState(''); // stores the current account connected
    const [network, setNetwork] = useState({});
    const adapter = useMemo(() => new TronLinkAdapter(), []);
    const [myTickets, setMyTickets] = useState([])

    const [isLoading, setIsLoading] = useState(false)

    const HttpProvider = TronWeb.providers.HttpProvider;
    const fullNode = new HttpProvider("https://nile.trongrid.io");
    const solidityNode = new HttpProvider("https://nile.trongrid.io");
    const eventServer = new HttpProvider("https://nile.trongrid.io");
    const privateKey = process.env.NEXT_PUBLIC_TRONLINK_PRIV_KEY; // seems like im only able to make transactions with the wallet this priv key belongs to?
    // window.tronWeb = new TronWeb(fullNode,solidityNode,eventServer, privateKey);
    const tronWeb = window.tronWeb
    // tronWeb.setHeader({"TRON-PRO-API-KEY": process.env.NEXT_PUBLIC_TRONGRID_API_KEY});

    // READ FUNCTIONS (NFT CONTRACT)

    const getOwnedTokenIds = async (ownerAddress, contractAddress) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const ownedTokens = await contract.getOwnedTokenIds(ownerAddress).call()
        console.log("this is owned tokens: ", ownedTokens)
        return ownedTokens
    }

    const getCatPrices = async (categoryId, contractAddress) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const ticketPrice = await contract.categoryPrices(categoryId).call()
        const decimalPrice = tronWeb.toDecimal(ticketPrice._hex)
        
        console.log("selected ticket price: ", typeof decimalPrice, decimalPrice)
        return decimalPrice
    }

    // const getMintLimit = (contractAddress) => {
    const getMintLimit = async (contractAddress) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const mintLimit = await contract.mintLimitPerAddress().call()
        const decimalLimit = tronWeb.toDecimal(mintLimit._hex)
        return decimalLimit
    }

    // function to get all the owned tokens across all event contracts
    const getAllOwnedTokens = async (userAddress) => {
        try {
            console.log("getAllOwnedTokens called: ", userAddress);
            let allNewTickets = []; // Aggregate all tickets here
    
            // Wait for all promises from map to resolve
            await Promise.all(eventData.map(async (event) => {
                console.log(event.eventTitle, event.contractAddress);
                const currentContractAddress = event.contractAddress;
                const contract = await tronWeb.contract().at(currentContractAddress);
                const ownedTokenIds = await contract.getOwnedTokenIds(userAddress).call();
                console.log(event.eventTitle, "tickets found: ", ownedTokenIds);
    
                // Temporary array for this contract
                let tempTickets = [];
                for (let i = 0; i < ownedTokenIds.length; i++) {
                    const currentTokenId = tronWeb.toDecimal(ownedTokenIds[i]._hex);
                    const isRedeemed = await contract.isTicketRedeemed(currentTokenId).call();
                    const isInsured = await contract.ticketInsurance(currentTokenId).call();
                    const catIndex = await contract.determineCategoryId(currentTokenId).call();
                    const catClass = tronWeb.toDecimal(catIndex) + 1;
                    const imageURL = await contract.tokenURI(currentTokenId).call();
                    const isCancelled = await contract.eventCanceled().call();
    
                    const newTicket = {
                        "contractAddress": currentContractAddress, 
                        "eventId": event.eventId,
                        "eventTitle": event.eventTitle,
                        "date": event.date,
                        "time": event.time, 
                        "location": event.location, 
                        "tokenId": currentTokenId,
                        "isRedeemed": isRedeemed,
                        "isInsured": isInsured,
                        "catClass": catClass,
                        "imageURL": imageURL,
                        "isCancelled": isCancelled,
                        "originalTicketPrice": tronWeb.toSun(event.catPricing[catIndex])
                    };
                    // i need a isListed checker
    
                    tempTickets.push(newTicket);
                }
    
                // Combine the tickets from this iteration into the main array
                allNewTickets = allNewTickets.concat(tempTickets);
            }));
    
            // Now update the state once with all new tickets
            setMyTickets(allNewTickets);
        } catch (error) {
            console.error("Error in getAllOwnedTokens: ", error);
            throw error;
        }
    }

    const isTicketRedeemed = async (contractAddress, tokenId) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const isRedeemed = await contract.isTicketRedeemed(tokenId).call()
        return isRedeemed
    }

    const isTicketInsured = async (contractAddress, tokenId) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const isInsured = await contract.ticketInsurance(tokenId).call()
        return isInsured
    }

    const getCategory = async (contractAddress, tokenId) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const catIndex = await contract.determineCategoryId(tokenId).call()
        const catClass = catIndex + 1
        return catClass
    }

    const getTokenURI = async (contractAddress, tokenId) => {
        const contract = await tronWeb.contract().at(contractAddress)
        const imageURL = await contract.tokenURI(tokenId).call()
        return imageURL
    }

    const isEventCanceled = async (contractAddress) => {
        const contract = await tronWeb.contract().at(contractAddress)
        return await contract.eventCanceled().call()
    }

    // WRITE FUNCTIONS (NFT CONTRACT)

    const mintTicket = async (categoryId, quantity, fee, contractAddress) => {
        try {
            const contract = await tronWeb.contract().at(contractAddress)
            const result = await contract.mintTicket(categoryId, quantity).send({
                feeLimit: 1000000000,
                callValue: fee * quantity,
                shouldPollResponse: true
            })
            console.log(result)
            return {success: true, result}
        } catch (error) {
            console.log("Error minting ticket: ", error)
            return { success: false, error }
        }
    }

    const buyInsurance = async (contractAddress, tokenId, originalTicketPrice) => {
        try {
            const contract = await tronWeb.contract().at(contractAddress)
            const insurancePrice = parseInt(originalTicketPrice) * 20/100
            const result = await contract.buyInsurance(tokenId).send({
                feeLimit: 1000000000,
                callValue: insurancePrice,
                shouldPollResponse: true
            })
            console.log("buy ticket insurance: ", result)
            return {success: true, result}
        } catch (error) {
            console.log("Error buying ticket insurance: ", error)
            return { success: false, error }
        }
    }

    const redeemTicket = async (contractAddress, tokenId) => {
        try {
            const contract = await tronWeb.contract().at(contractAddress)
            const result = await contract.redeemTicket(tokenId).send({
                feeLimit: 1000000000,
                callValue: 0,
                shouldPollResponse: true
            })
            console.log("redeem ticket: ", result)
            return {success: true, result}
        } catch (error) {
            console.log("Error redeeming ticket: ", error)
            return { success: false, error }
        }
    }

    // UTILITY FUNCTIONS

    const isTronLinkConnected = async () => {
        console.log("tronweb connection: ", await tronWeb.isConnected())

        if (tronWeb) {
            return true
        }
        else {
            return false
        }
    }

    const decodeHexString = (hexString) => {
        const data = hexString.slice(8); // Remove the function selector
        const decodedString = tronWeb.toUtf8(data);
        const strippedString = decodedString.replace(/[\u0000-\u001F]+/g, ''); // Remove null padding
        return strippedString.trim(); // Additionally, trim any whitespace from both ends of the string
    }

    return(
        <AppContext.Provider value={{
            adapter, readyState, account, network, isLoading, myTickets,
            setReadyState, setAccount, setNetwork, setIsLoading, setMyTickets,
            tronWeb, 
            isTronLinkConnected,
            getOwnedTokenIds, getCatPrices, getMintLimit, getAllOwnedTokens,
            mintTicket, buyInsurance, redeemTicket,
            decodeHexString,
        }}>
            {children}
        </AppContext.Provider>
    )
})

export const useGlobalContext = () => {
    return useContext(AppContext)
}

export { AppContext, AppProvider }