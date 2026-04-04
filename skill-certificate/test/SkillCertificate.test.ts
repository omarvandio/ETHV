import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { SkillCertificate } from "../typechain-types";

describe("SkillCertificate", () => {
  let contract: SkillCertificate;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const SKILL      = "Python";
  const SCORE      = 85;
  const LEVEL      = "Senior";
  const TOKEN_URI  = "ipfs://QmExampleHash/metadata.json";
  const CV_HASH    = ethers.keccak256(ethers.toUtf8Bytes("cv_content_example"));

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SkillCertificate");
    contract = (await Factory.deploy()) as SkillCertificate;
    await contract.waitForDeployment();
  });

  // ─── Minting ──────────────────────────────────────────────────────────────

  describe("mintCertificate", () => {
    it("should mint a certificate with correct data", async () => {
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);

      const cert = await contract.getCertificate(0);
      expect(cert.skillName).to.equal(SKILL);
      expect(cert.score).to.equal(SCORE);
      expect(cert.level).to.equal(LEVEL);
      expect(cert.cvHash).to.equal(CV_HASH);
      expect(cert.isValid).to.be.true;
      expect(cert.issueDate).to.be.gt(0);
    });

    it("should set tokenURI correctly", async () => {
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);
      expect(await contract.tokenURI(0)).to.equal(TOKEN_URI);
    });

    it("should increment totalCertificates", async () => {
      expect(await contract.totalCertificates()).to.equal(0);
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);
      expect(await contract.totalCertificates()).to.equal(1);
      await contract.mintCertificate(user2.address, "React", 90, "Expert", TOKEN_URI, CV_HASH);
      expect(await contract.totalCertificates()).to.equal(2);
    });

    it("should emit CertificateMinted event", async () => {
      await expect(
        contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH)
      )
        .to.emit(contract, "CertificateMinted")
        .withArgs(0, user1.address, SKILL, SCORE, LEVEL);
    });

    it("should revert if score > 100", async () => {
      await expect(
        contract.mintCertificate(user1.address, SKILL, 101, LEVEL, TOKEN_URI, CV_HASH)
      ).to.be.revertedWith("Score must be 0-100");
    });

    it("should revert if skillName is empty", async () => {
      await expect(
        contract.mintCertificate(user1.address, "", SCORE, LEVEL, TOKEN_URI, CV_HASH)
      ).to.be.revertedWith("Skill name required");
    });

    it("should NOT allow non-owner to mint", async () => {
      await expect(
        contract
          .connect(user1)
          .mintCertificate(user2.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ─── Revoke ───────────────────────────────────────────────────────────────

  describe("revokeCertificate", () => {
    beforeEach(async () => {
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);
    });

    it("should revoke a certificate", async () => {
      await contract.revokeCertificate(0);
      const cert = await contract.getCertificate(0);
      expect(cert.isValid).to.be.false;
    });

    it("should emit CertificateRevoked event", async () => {
      await expect(contract.revokeCertificate(0))
        .to.emit(contract, "CertificateRevoked")
        .withArgs(0);
    });

    it("should revert if already revoked", async () => {
      await contract.revokeCertificate(0);
      await expect(contract.revokeCertificate(0)).to.be.revertedWith("Already revoked");
    });

    it("should NOT allow non-owner to revoke", async () => {
      await expect(
        contract.connect(user1).revokeCertificate(0)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  // ─── Soulbound (non-transferable) ─────────────────────────────────────────

  describe("Soulbound — transfers disabled", () => {
    beforeEach(async () => {
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);
    });

    it("should NOT allow transfer via transferFrom", async () => {
      await expect(
        contract.connect(user1).transferFrom(user1.address, user2.address, 0)
      ).to.be.revertedWith("Soulbound: transfers are disabled");
    });

    it("should NOT allow safeTransferFrom", async () => {
      await expect(
        contract
          .connect(user1)
          ["safeTransferFrom(address,address,uint256)"](user1.address, user2.address, 0)
      ).to.be.revertedWith("Soulbound: transfers are disabled");
    });
  });

  // ─── Queries ──────────────────────────────────────────────────────────────

  describe("getCertificatesByOwner", () => {
    it("should return all tokenIds for an owner", async () => {
      await contract.mintCertificate(user1.address, "Python", 85, "Senior", TOKEN_URI, CV_HASH);
      await contract.mintCertificate(user1.address, "React",  90, "Expert", TOKEN_URI, CV_HASH);
      await contract.mintCertificate(user2.address, "AWS",    70, "Mid",    TOKEN_URI, CV_HASH);

      const user1Tokens = await contract.getCertificatesByOwner(user1.address);
      const user2Tokens = await contract.getCertificatesByOwner(user2.address);

      expect(user1Tokens.length).to.equal(2);
      expect(user2Tokens.length).to.equal(1);
      expect(user1Tokens[0]).to.equal(0n);
      expect(user1Tokens[1]).to.equal(1n);
      expect(user2Tokens[0]).to.equal(2n);
    });

    it("should return empty array for address with no certificates", async () => {
      const tokens = await contract.getCertificatesByOwner(user2.address);
      expect(tokens.length).to.equal(0);
    });
  });

  describe("verifyCertificate", () => {
    it("should return true for a valid certificate", async () => {
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);
      expect(await contract.verifyCertificate(0)).to.be.true;
    });

    it("should return false for a revoked certificate", async () => {
      await contract.mintCertificate(user1.address, SKILL, SCORE, LEVEL, TOKEN_URI, CV_HASH);
      await contract.revokeCertificate(0);
      expect(await contract.verifyCertificate(0)).to.be.false;
    });

    it("should return false for a non-existent token", async () => {
      expect(await contract.verifyCertificate(999)).to.be.false;
    });
  });
});
