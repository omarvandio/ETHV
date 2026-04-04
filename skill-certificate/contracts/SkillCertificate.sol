// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SkillCertificate
 * @notice Soulbound NFT certificate for validated skills. Non-transferable after mint.
 * @dev ERC-721 deployed on zkSYS Testnet (Chain ID: 57057). Uses OpenZeppelin v4.
 */
contract SkillCertificate is ERC721URIStorage, Ownable {

    // ─── Structs ────────────────────────────────────────────────────────────

    struct CertificateData {
        string  skillName;   // e.g. "Python", "React", "AWS"
        uint8   score;       // 0-100
        string  level;       // "Junior" | "Mid" | "Senior" | "Expert"
        uint256 issueDate;   // block.timestamp
        bytes32 cvHash;      // keccak256 of the user's CV to link certificate <> CV
        bool    isValid;     // false if revoked
    }

    // ─── State ──────────────────────────────────────────────────────────────

    uint256 private _tokenIdCounter;

    mapping(uint256 => CertificateData)  private _certificates;
    mapping(address => uint256[])        private _ownerTokens;

    // ─── Events ─────────────────────────────────────────────────────────────

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed to,
        string  skillName,
        uint8   score,
        string  level
    );

    event CertificateRevoked(uint256 indexed tokenId);

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor() ERC721("SkillCertificate", "SKCT") {}

    // ─── Mint ───────────────────────────────────────────────────────────────

    /**
     * @notice Mint a skill certificate to `to`. Only callable by owner.
     * @param to        Recipient address
     * @param skillName Name of the validated skill
     * @param score     Score obtained (0-100)
     * @param level     Skill level achieved
     * @param uri       Token metadata URI (IPFS / off-chain JSON)
     * @param cvHash    keccak256 hash of the user's CV file
     */
    function mintCertificate(
        address to,
        string  calldata skillName,
        uint8   score,
        string  calldata level,
        string  calldata uri,
        bytes32 cvHash
    ) external onlyOwner returns (uint256) {
        require(score <= 100, "Score must be 0-100");
        require(bytes(skillName).length > 0, "Skill name required");
        require(bytes(level).length > 0, "Level required");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);

        _certificates[tokenId] = CertificateData({
            skillName: skillName,
            score:     score,
            level:     level,
            issueDate: block.timestamp,
            cvHash:    cvHash,
            isValid:   true
        });

        _ownerTokens[to].push(tokenId);

        emit CertificateMinted(tokenId, to, skillName, score, level);
        return tokenId;
    }

    // ─── Revoke ─────────────────────────────────────────────────────────────

    /**
     * @notice Revoke a certificate. Only callable by owner.
     */
    function revokeCertificate(uint256 tokenId) external onlyOwner {
        require(_exists(tokenId), "Certificate does not exist");
        require(_certificates[tokenId].isValid, "Already revoked");

        _certificates[tokenId].isValid = false;
        emit CertificateRevoked(tokenId);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    /**
     * @notice Returns all data for a certificate.
     */
    function getCertificate(uint256 tokenId)
        external
        view
        returns (CertificateData memory)
    {
        require(_exists(tokenId), "Certificate does not exist");
        return _certificates[tokenId];
    }

    /**
     * @notice Returns all tokenIds owned by `owner`.
     */
    function getCertificatesByOwner(address owner)
        external
        view
        returns (uint256[] memory)
    {
        return _ownerTokens[owner];
    }

    /**
     * @notice Returns true if the certificate exists and has not been revoked.
     */
    function verifyCertificate(uint256 tokenId) external view returns (bool) {
        if (!_exists(tokenId)) return false;
        return _certificates[tokenId].isValid;
    }

    /**
     * @notice Total certificates minted (including revoked).
     */
    function totalCertificates() external view returns (uint256) {
        return _tokenIdCounter;
    }

    // ─── Soulbound: block all transfers after mint ───────────────────────────

    /**
     * @dev Override _beforeTokenTransfer to make tokens non-transferable (Soulbound).
     *      Mint (from == address(0)) is allowed, all other transfers are blocked.
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    ) internal override(ERC721) {
        require(from == address(0), "Soulbound: transfers are disabled");
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    // ─── Required overrides (OZ v4 ERC721URIStorage) ────────────────────────

    function _burn(uint256 tokenId) internal override(ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
